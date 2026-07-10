import { useApi } from '../api';
import { ErrorNote } from '../components/common';
import type { JiraStatus, Tenant } from '../types';

export function SettingsPage() {
  const tenant = useApi<Tenant>('/api/v1/tenant');
  const jira = useApi<JiraStatus>('/api/v1/jira/status');

  if (tenant.error) return <ErrorNote error={tenant.error} />;
  const t = tenant.data;

  return (
    <>
      {t && (
        <div className="card">
          <h3>Tenant</h3>
          <table className="data">
            <tbody>
              <tr>
                <td>Organisation</td>
                <td style={{ color: 'var(--text-primary)' }}>{t.name}</td>
              </tr>
              <tr>
                <td>Plan</td>
                <td>
                  <span className="badge accent">{t.plan}</span>
                </td>
              </tr>
              <tr>
                <td>Region / Data residency</td>
                <td>
                  {t.region} · {t.settings.dataResidency}
                </td>
              </tr>
              <tr>
                <td>Regulatory profiles</td>
                <td>
                  {t.settings.regulatoryProfiles.map((profile) => (
                    <span key={profile} className="badge good" style={{ marginRight: 4 }}>
                      {profile.replaceAll('_', ' ')}
                    </span>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {t && (
        <div className="card">
          <h3>AI Configuration</h3>
          <table className="data">
            <tbody>
              <tr>
                <td>LLM provider</td>
                <td>
                  <span className={`badge ${t.settings.llmProvider === 'anthropic' ? 'good' : 'warning'}`}>{t.settings.llmProvider}</span>
                  {t.settings.llmProvider === 'simulated' && (
                    <span className="sub" style={{ marginLeft: 8 }}>
                      set ANTHROPIC_API_KEY on the API to enable live Claude reasoning
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td>Model</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.settings.llmModel}</td>
              </tr>
              <tr>
                <td>Gate confidence threshold</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{t.settings.gateConfidenceThreshold}</td>
              </tr>
              <tr>
                <td>Human approval required for</td>
                <td>
                  {t.settings.humanApprovalRequired.map((type) => (
                    <span key={type} className="badge" style={{ marginRight: 4 }}>
                      {type.replaceAll('_', ' ')}
                    </span>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Integrations</h3>
        <table className="data">
          <tbody>
            <tr>
              <td>JIRA Cloud</td>
              <td>
                <span className={`badge ${jira.data?.connection.connected ? 'good' : 'critical'}`}>
                  {jira.data?.connection.connected ? 'connected (OAuth 2.0)' : 'disconnected'}
                </span>
                <span className="sub" style={{ marginLeft: 8 }}>
                  {jira.data?.connection.baseUrl} · {jira.data?.connection.direction} · cron {jira.data?.connection.scheduleCron}
                </span>
              </td>
            </tr>
            <tr>
              <td>GitHub / Azure DevOps / Bitbucket</td>
              <td>
                <span className="badge warning">available — connect in production deployment</span>
              </td>
            </tr>
            <tr>
              <td>Salesforce orgs</td>
              <td>
                <span className="badge warning">available — connect in production deployment</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
