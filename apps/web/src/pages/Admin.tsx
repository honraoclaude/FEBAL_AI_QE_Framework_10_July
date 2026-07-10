import { useApi } from '../api';
import { ErrorNote } from '../components/common';
import type { User } from '../types';

export function AdminPage() {
  const users = useApi<User[]>('/api/v1/users');
  const matrix = useApi<Record<string, string[]>>('/api/v1/approvals/matrix');

  if (users.error) return <ErrorNote error={users.error} />;

  return (
    <>
      <div className="card">
        <h3>Users & Roles ({users.data?.length ?? 0})</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => (
              <tr key={user.id}>
                <td style={{ color: 'var(--text-primary)' }}>{user.displayName}</td>
                <td style={{ fontSize: 12 }}>{user.email}</td>
                <td>
                  {user.roles.map((role) => (
                    <span key={role} className="badge accent" style={{ marginRight: 4 }}>
                      {role.replaceAll('_', ' ')}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Role-Based Approval Matrix</h3>
        <div className="sub" style={{ margin: '4px 0 10px' }}>
          Which roles may approve each artefact type. Configurable per tenant.
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Approval Type</th>
              <th>Authorised Roles</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrix.data ?? {}).map(([type, roles]) => (
              <tr key={type}>
                <td style={{ color: 'var(--text-primary)' }}>{type.replaceAll('_', ' ')}</td>
                <td>
                  {roles.map((role) => (
                    <span key={role} className="badge" style={{ marginRight: 4 }}>
                      {role.replaceAll('_', ' ')}
                    </span>
                  ))}
                  <span className="badge accent">ADMIN</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
