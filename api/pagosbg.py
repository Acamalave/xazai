"""
XAZAI - Yappy IPN (Instant Payment Notification) Serverless Function (Vercel)
Handles GET /api/pagosbg
Yappy V2 sends payment status notifications here with hash verification.

Status codes:
  E = Ejecutado (paid successfully)
  R = Rechazado (customer didn't confirm within 5 min)
  C = Cancelado (customer cancelled in Yappy app)
  X = Expirado (customer never started payment process)
"""

import json
import hmac
import hashlib
import base64
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Same secret key as in create-payment.py (Clave Secreta from Yappy Comercial)
CLAVE_SECRETA = "WVBfRDNBRjEwRkQtNjQyQS0zQUEyLThEMjMtRkNGQjhBM0YxRjhFLjE3ZTczYjRjLWVkNTktNGQ4YS1hNWVjLTYyM2M0YTdhNGUwNw=="


def validate_hash(order_id, status, domain, hash_from_request):
    """
    Validate the IPN hash using HMAC-SHA256.
    The signing key is extracted from the base64-decoded Clave Secreta.
    Format: base64decode(CLAVE_SECRETA) → "signing_key.merchantId"
    """
    try:
        secret = base64.b64decode(CLAVE_SECRETA).decode('utf-8')
        # The secret may contain a dot separator: signing_key.merchantId
        signing_key = secret.split('.')[0]

        # Create HMAC-SHA256: hash(signing_key, orderId + status + domain)
        signature = hmac.new(
            signing_key.encode('utf-8'),
            f"{order_id}{status}{domain}".encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(hash_from_request, signature)
    except Exception as e:
        print(f"Error validating hash: {e}")
        return False


class handler(BaseHTTPRequestHandler):
    """Handle Yappy V2 IPN payment callback notifications"""

    def do_GET(self):
        # Parse query parameters
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        order_id = params.get("orderId", "")
        status = params.get("status", "")
        hash_value = params.get("hash", "")
        domain = params.get("domain", "")
        confirmation = params.get("confirmationNumber", "")

        print(f"YAPPY IPN: Orden={order_id}, Estado={status}, Domain={domain}, Hash={hash_value[:16]}...")

        # Validate hash
        if not all([order_id, status, domain, hash_value]):
            self._send_json(400, {"success": False, "error": "Missing required parameters"})
            return

        is_valid = validate_hash(order_id, status, domain, hash_value)

        if is_valid:
            print(f"YAPPY IPN VALID: Orden={order_id}, Estado={status}")

            # Status mapping:
            # E = Ejecutado → payment confirmed, order is valid
            # R = Rechazado → customer didn't confirm
            # C = Cancelado → customer cancelled
            # X = Expirado → payment request expired

            if status == 'E':
                print(f"PAYMENT CONFIRMED: Order {order_id}, Confirmation: {confirmation}")
                # Note: Firestore update is handled by the frontend via eventSuccess
                # This IPN serves as a server-side backup confirmation
            elif status in ('R', 'C', 'X'):
                status_names = {'R': 'Rechazado', 'C': 'Cancelado', 'X': 'Expirado'}
                print(f"PAYMENT {status_names.get(status, 'Unknown')}: Order {order_id}")

            self._send_json(200, {
                "success": True,
                "orderId": order_id,
                "status": status,
                "message": "IPN processed"
            })
        else:
            print(f"YAPPY IPN INVALID HASH: Orden={order_id}")
            self._send_json(200, {
                "success": False,
                "error": "Invalid hash"
            })

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
