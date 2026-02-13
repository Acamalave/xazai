"""
XAZAI - Yappy Callback Serverless Function (Vercel)
Handles GET /api/pagosbg (Yappy sends payment notifications here)
"""

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


class handler(BaseHTTPRequestHandler):
    """Handle Yappy payment callback notifications"""

    def do_GET(self):
        # Parse query parameters
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        order_id = params.get("orderId", "")
        status = params.get("status", "")
        confirmation = params.get("confirmationNumber", "")

        print(f"YAPPY CALLBACK: Orden={order_id}, Estado={status}, Conf={confirmation}")

        # Status codes: E=Ejecutado, R=Rechazado, C=Cancelado
        # In a serverless environment, we rely on Firestore for state
        # The client checks payment status via URL params (?payment=success&order=XZ-123)

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": status,
            "orderId": order_id,
            "message": "Notification received"
        }).encode('utf-8'))
