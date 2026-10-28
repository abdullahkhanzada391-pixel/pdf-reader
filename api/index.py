import sys
import traceback
from pathlib import Path

# Add project root directory to sys.path so modules like app, config, services are resolved
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

try:
    from app import app
except Exception as e:
    tb = traceback.format_exc()
    from flask import Flask, Response
    app = Flask(__name__)
    
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def catch_all(path):
        return Response(
            f"""<!DOCTYPE html>
            <html>
            <head><title>500 - Application Startup Error</title></head>
            <body style="font-family: monospace; padding: 2rem; background: #121212; color: #ff6b6b;">
                <h2>DocuMind AI: Serverless Initialization Error</h2>
                <pre style="background: #1e1e1e; padding: 1.5rem; border-radius: 8px; overflow-x: auto; color: #f8f8f2;">{tb}</pre>
            </body>
            </html>""",
            status=500,
            mimetype="text/html"
        )

