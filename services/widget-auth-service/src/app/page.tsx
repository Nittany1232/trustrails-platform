/**
 * Default page for Widget Auth Service
 * Shows service status and basic information
 */

export default function HomePage() {
  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '800px',
      margin: '50px auto',
      padding: '20px',
      lineHeight: '1.6'
    }}>
      <h1>🔐 TrustRails Widget Authentication Service</h1>

      <div style={{
        background: '#f0f9ff',
        border: '1px solid #0ea5e9',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '30px'
      }}>
        <h2>✅ Service Status: Running</h2>
        <p>Widget authentication microservice is operational.</p>
      </div>

      <h2>📋 Available Endpoints</h2>
      <ul>
        <li><strong>POST /api/widget/auth</strong> - Widget authentication with API keys</li>
        <li><strong>GET /api/widget/custodians</strong> - Browse available custodians</li>
        <li><strong>POST /api/widget/create-account</strong> - Create/retrieve user accounts</li>
      </ul>

      <h2>🔧 Service Information</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>Service</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>Widget Authentication Service</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>Framework</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>Next.js 14+ (App Router)</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>Port</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>3003</td>
          </tr>
          <tr>
            <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>Environment</td>
            <td style={{ padding: '8px', border: '1px solid #ddd' }}>{process.env.NODE_ENV || 'development'}</td>
          </tr>
        </tbody>
      </table>

      <h2>📖 Documentation</h2>
      <p>
        For detailed API documentation and usage instructions, see the{' '}
        <a href="https://github.com/trustrails/trustrails-platform/tree/main/services/widget-auth-service"
           style={{ color: '#0ea5e9', textDecoration: 'none' }}>
          README.md
        </a> file.
      </p>

      <div style={{
        background: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: '8px',
        padding: '15px',
        marginTop: '30px'
      }}>
        <h3>⚠️ Production Note</h3>
        <p>
          This service is designed for API-only usage. In production, consider:
        </p>
        <ul>
          <li>Disabling this web interface</li>
          <li>Setting up proper health check endpoints</li>
          <li>Configuring monitoring and alerting</li>
        </ul>
      </div>
    </div>
  );
}