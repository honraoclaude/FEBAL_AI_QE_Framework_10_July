import { describe, expect, it } from 'vitest';
import { analyzeApex, generateApexTestClass, parseApexClass } from '../src/apex.js';

export const FLAWED_APEX = `public class FeeCalculator {
    public static Decimal calculateTotalFees(List<Id> accountIds) {
        Decimal total = 0;
        for (Id accountId : accountIds) {
            List<Fee__c> fees = [SELECT Amount__c FROM Fee__c WHERE Account__c = :accountId];
            for (Fee__c fee : fees) {
                total += fee.Amount__c;
                fee.Processed__c = true;
                update fee;
            }
        }
        System.debug('total: ' + total);
        return total;
    }

    public static void assignOwner(Id recordId) {
        Fee__c fee = new Fee__c(Id = recordId);
        fee.OwnerId = '005000000000001AAA';
        update fee;
    }
}
`;

describe('Apex static analysis', () => {
  it('parses class name, sharing model and public methods', () => {
    const info = parseApexClass(FLAWED_APEX);
    expect(info.name).toBe('FeeCalculator');
    expect(info.sharing).toBe('none');
    expect(info.methods.map((m) => m.name)).toEqual(['calculateTotalFees', 'assignOwner']);
    expect(info.methods[0]!.params).toEqual([{ type: 'List<Id>', name: 'accountIds' }]);
  });

  it('finds real governor-limit and security issues with line anchors', () => {
    const findings = analyzeApex(FLAWED_APEX, 'FeeCalculator.cls');
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain('soql-in-loop');
    expect(rules).toContain('dml-in-loop');
    expect(rules).toContain('sharing-declaration');
    expect(rules).toContain('debug-statement');
    expect(rules).toContain('hardcoded-id');

    const soql = findings.find((f) => f.rule === 'soql-in-loop')!;
    expect(soql.severity).toBe('BLOCKER');
    expect(soql.line).toBe(5); // the SELECT line
    expect(soql.snippet).toContain('SELECT');
  });

  it('passes clean, well-formed Apex', () => {
    const clean = `public with sharing class FeeSummary {
    public static Decimal sum(List<Decimal> values) {
        Decimal total = 0;
        for (Decimal v : values) {
            total += v;
        }
        return total;
    }
}
`;
    expect(analyzeApex(clean, 'FeeSummary.cls')).toHaveLength(0);
  });

  it('generates a compilable test-class skeleton covering public methods', () => {
    const generated = generateApexTestClass(FLAWED_APEX)!;
    expect(generated.className).toBe('FeeCalculatorTest');
    expect(generated.coveredMethods).toEqual(['calculateTotalFees', 'assignOwner']);
    expect(generated.source).toContain('@IsTest');
    expect(generated.source).toContain('private class FeeCalculatorTest');
    expect(generated.source).toContain('calculateTotalFees_happyPath');
    expect(generated.source).toContain('calculateTotalFees_bulk200');
    expect(generated.source).toContain('Test.startTest();');
    expect(generated.source).toContain('Assert.');
    // Static methods are called on the class, not an instance.
    expect(generated.source).toContain('FeeCalculator.calculateTotalFees(new List<Id>())');
    expect(generated.source).not.toContain('SeeAllData');
  });

  it('declines to generate tests for test classes themselves', () => {
    expect(generateApexTestClass('@IsTest private class XTest { }')).toBeNull();
  });
});
