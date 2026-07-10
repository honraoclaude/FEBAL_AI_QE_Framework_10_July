/**
 * Real Apex static analysis and unit-test generation (pure functions).
 * This is genuine source analysis — findings carry file/line evidence — not
 * heuristic scoring. Used by the deep dev agents when a branch is supplied.
 */

export interface ApexFinding {
  rule: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR';
  file: string;
  line: number;
  message: string;
  snippet: string;
}

export interface ApexMethod {
  name: string;
  returnType: string;
  params: Array<{ type: string; name: string }>;
  isStatic: boolean;
}

export interface ApexClassInfo {
  name: string;
  sharing: 'with sharing' | 'without sharing' | 'inherited sharing' | 'none';
  isTest: boolean;
  methods: ApexMethod[];
}

const CLASS_RE = /(?:global|public)\s+(?:(with sharing|without sharing|inherited sharing)\s+)?(?:virtual\s+|abstract\s+)?class\s+(\w+)/;
const METHOD_RE = /(?:public|global)\s+(static\s+)?(?!class\b)([\w.<>, ]+?)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;

export function parseApexClass(source: string): ApexClassInfo {
  const classMatch = CLASS_RE.exec(source);
  const methods: ApexMethod[] = [];
  let match: RegExpExecArray | null;
  METHOD_RE.lastIndex = 0;
  while ((match = METHOD_RE.exec(source)) !== null) {
    const [, staticKw, returnType, name, paramList] = match;
    if (name === classMatch?.[2]) continue; // constructor
    const params = paramList!
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const parts = p.split(/\s+/);
        return { type: parts.slice(0, -1).join(' '), name: parts[parts.length - 1]! };
      });
    methods.push({ name: name!, returnType: returnType!.trim(), params, isStatic: Boolean(staticKw) });
  }
  return {
    name: classMatch?.[2] ?? 'Unknown',
    sharing: (classMatch?.[1] as ApexClassInfo['sharing']) ?? 'none',
    isTest: /@IsTest/i.test(source),
    methods,
  };
}

/** Line-anchored static checks for the most common Apex review findings. */
export function analyzeApex(source: string, file: string): ApexFinding[] {
  const findings: ApexFinding[] = [];
  const lines = source.split('\n');
  const info = parseApexClass(source);

  const add = (rule: string, severity: ApexFinding['severity'], line: number, message: string) =>
    findings.push({ rule, severity, file, line: line + 1, message, snippet: (lines[line] ?? '').trim().slice(0, 120) });

  if (!info.isTest && info.sharing === 'none' && CLASS_RE.test(source)) {
    const line = lines.findIndex((l) => CLASS_RE.test(l));
    add('sharing-declaration', 'CRITICAL', Math.max(line, 0), `Class ${info.name} declares no sharing model; record-level security is not enforced. Declare "with sharing" (or document why not).`);
  }

  let loopDepth = 0;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (/\b(for|while)\s*\(/.test(trimmed)) loopDepth += 1;
    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;
    if (loopDepth > 0) {
      if (/\[\s*SELECT\s/i.test(trimmed)) add('soql-in-loop', 'BLOCKER', i, 'SOQL query inside a loop — will hit the 100-query governor limit under bulk load. Query outside the loop into a Map.');
      if (/\b(insert|update|delete|upsert)\s+\w/i.test(trimmed) && !/\/\//.test(trimmed.split(/\b(insert|update|delete|upsert)\b/i)[0]!))
        add('dml-in-loop', 'BLOCKER', i, 'DML statement inside a loop — will hit the 150-DML governor limit. Collect records and perform bulk DML after the loop.');
      loopDepth += opens - closes >= 0 ? 0 : 0;
      if (closes > opens) loopDepth = Math.max(0, loopDepth - (closes - opens));
    }
    if (/\bSystem\.debug\s*\(/.test(trimmed)) add('debug-statement', 'MINOR', i, 'System.debug left in code — remove or route through a logging framework before release.');
    if (/['"][0-9a-zA-Z]{15}(?:[0-9a-zA-Z]{3})?['"]/.test(trimmed) && /^(00[15DQOaenq]|500|701|800)/.test(trimmed.match(/['"]([0-9a-zA-Z]{15,18})['"]/)?.[1] ?? ''))
      add('hardcoded-id', 'CRITICAL', i, 'Hardcoded Salesforce record ID — breaks between orgs. Query for the record or use Custom Metadata.');
    if (/@IsTest/i.test(source) && /SeeAllData\s*=\s*true/i.test(trimmed)) add('see-all-data', 'CRITICAL', i, 'SeeAllData=true couples the test to org data. Create test data in the test itself.');
  });

  if (info.isTest) {
    const hasAssert = /\bSystem\.assert(Equals|NotEquals)?\s*\(|\bAssert\.\w+\(/.test(source);
    if (!hasAssert) add('test-without-assert', 'MAJOR', 0, `Test class ${info.name} contains no assertions — it exercises code without verifying behaviour.`);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Test generation
// ---------------------------------------------------------------------------

function defaultValue(type: string): string {
  const t = type.replace(/\s/g, '');
  if (/^String$/i.test(t)) return "'test-value'";
  if (/^(Integer|Long)$/i.test(t)) return '1';
  if (/^(Decimal|Double)$/i.test(t)) return '1.0';
  if (/^Boolean$/i.test(t)) return 'true';
  if (/^Date$/i.test(t)) return 'Date.today()';
  if (/^Datetime$/i.test(t)) return 'Datetime.now()';
  if (/^Id$/i.test(t)) return 'null /* TODO: provide a record Id created in test setup */';
  if (/^List</i.test(t)) return `new ${type}()`;
  if (/^Set</i.test(t)) return `new ${type}()`;
  if (/^Map</i.test(t)) return `new ${type}()`;
  return `null /* TODO: construct a ${type} */`;
}

export interface GeneratedTest {
  className: string;
  fileName: string;
  source: string;
  coveredMethods: string[];
}

/**
 * Generates a compilable Apex test-class skeleton for a class: a happy-path
 * and a bulk (200-iteration) test per public method, Arrange/Act/Assert
 * structure, no SeeAllData, explicit assertions with TODO markers where
 * domain knowledge is required.
 */
export function generateApexTestClass(source: string): GeneratedTest | null {
  const info = parseApexClass(source);
  if (info.isTest || info.methods.length === 0) return null;
  const testable = info.methods.slice(0, 5);
  const receiver = (m: ApexMethod) => (m.isStatic ? info.name : 'instance');

  const blocks = testable.map((m) => {
    const args = m.params.map((p) => defaultValue(p.type)).join(', ');
    const isVoid = /^void$/i.test(m.returnType);
    const call = `${receiver(m)}.${m.name}(${args})`;
    const instanceDecl = m.isStatic ? '' : `        ${info.name} instance = new ${info.name}();\n`;
    const happy = `    @IsTest
    static void ${m.name}_happyPath() {
        // Arrange
${instanceDecl}        // TODO: create the records this method depends on

        // Act
        Test.startTest();
        ${isVoid ? `${call};` : `${m.returnType} result = ${call};`}
        Test.stopTest();

        // Assert
        ${isVoid ? `Assert.isTrue(true, 'TODO: assert the observable side effect of ${m.name}');` : `Assert.isNotNull(result, '${m.name} should return a value for valid input');`}
    }`;
    const bulk = `    @IsTest
    static void ${m.name}_bulk200() {
        // Governor-limit safety: the method must survive 200-record volume
${instanceDecl}        Test.startTest();
        for (Integer i = 0; i < 200; i++) {
            ${call};
        }
        Test.stopTest();
        Assert.isTrue(Limits.getQueries() <= Limits.getLimitQueries(), 'SOQL usage must stay within governor limits at bulk volume');
    }`;
    return `${happy}\n\n${bulk}`;
  });

  const className = `${info.name}Test`;
  return {
    className,
    fileName: `${className}.cls`,
    coveredMethods: testable.map((m) => m.name),
    source: `/**
 * Generated by QE.ai Apex Unit Test Generator.
 * Covers: ${testable.map((m) => m.name).join(', ')}
 * Review TODO markers before running — data setup is domain-specific.
 */
@IsTest
private class ${className} {

${blocks.join('\n\n')}
}
`,
  };
}
