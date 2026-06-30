import { Credentials } from "google-auth-library";

// Generates the OAuth success HTML page with token display and copy-to-clipboard
export const generateSuccessPage = (tokens: Credentials): string => {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google APIs OAuth Success</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; margin: 50px auto; padding: 20px;
            background: #f8f9fa; color: #333;
          }
          .container { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; color: #155724; margin-bottom: 25px; }
          .token-section { background: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; margin: 15px 0; border-radius: 5px; }
          .token {
            background: #fff; border: 1px solid #ccc; padding: 15px; margin: 10px 0;
            border-radius: 4px; font-family: 'Courier New', monospace;
            word-break: break-all; font-size: 13px; color: #d73a49;
          }
          .instructions {
            background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px;
            border-radius: 8px; color: #856404; margin-top: 25px;
          }
          .api-list { background: #e3f2fd; border: 1px solid #bbdefb; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .api-item { display: inline-block; background: #2196f3; color: white; padding: 5px 12px; margin: 3px; border-radius: 15px; font-size: 12px; }
          h2 { color: #155724; margin-top: 0; }
          h3 { color: #495057; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
          code { background: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
          .copy-btn {
            background: #007bff; color: white; border: none; padding: 8px 15px;
            border-radius: 4px; cursor: pointer; margin-left: 10px;
          }
          .copy-btn:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">
            <h2>🎉 OAuth Authorization Successful!</h2>
            <p>Your Google API access has been authorized for multiple services.</p>
          </div>

          <div class="api-list">
            <h3>✅ Authorized APIs:</h3>
            <span class="api-item">Google Business Profile</span>
          </div>

          <div class="token-section">
            <h3>🔑 Refresh Token (Save this to your .env file):</h3>
            <div class="token" id="refreshToken">
              GOOGLE_REFRESH_TOKEN=${
                tokens.refresh_token || "No refresh token received"
              }
            </div>
            <button class="copy-btn" onclick="copyToClipboard(event, 'refreshToken')">Copy to Clipboard</button>
          </div>

          <div class="token-section">
            <h3>⏰ Access Token (temporary - expires ${
              tokens.expiry_date
                ? new Date(tokens.expiry_date).toLocaleString()
                : "unknown"
            }):</h3>
            <div class="token" id="accessToken">
              ${
                tokens.access_token
                  ? tokens.access_token.substring(0, 50) + "..."
                  : "No access token received"
              }
            </div>
          </div>

          <div class="instructions">
            <h4>📋 Next Steps:</h4>
            <ol>
              <li><strong>Copy the refresh token</strong> from above (click the copy button)</li>
              <li><strong>Update your .env file:</strong> Add or replace <code>GOOGLE_REFRESH_TOKEN=your_token_here</code></li>
              <li><strong>Restart your server</strong> to load the new token</li>
              <li><strong>Test your APIs:</strong>
                <ul>
                  <li>GBP: <code>GET /api/gbp/locations/get</code></li>
                </ul>
              </li>
            </ol>

            <p><strong>📝 Note:</strong> This token grants access to the Google Business Profile API with the following scope:</p>
            <ul>
              <li>Business Profile (manage business listings and access insights)</li>
            </ul>
          </div>
        </div>

        <script>
          function copyToClipboard(evt, elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent || element.innerText;
            navigator.clipboard.writeText(text).then(function() {
              const btn = evt.currentTarget;
              const originalText = btn.textContent;
              btn.textContent = 'Copied!';
              btn.style.background = '#28a745';
              setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#007bff';
              }, 2000);
            }).catch(function() {
              const btn = evt.currentTarget;
              btn.textContent = 'Copy failed';
              btn.style.background = '#dc3545';
            });
          }
        </script>
      </body>
      </html>
    `;
};
