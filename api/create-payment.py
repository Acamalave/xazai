"""
XAZAI - Yappy Payment Serverless Function (Vercel)
Handles POST /api/create-payment
"""

import json
import hmac
import hashlib
import base64
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl
from http.server import BaseHTTPRequestHandler

# ========================================
# YAPPY CONFIGURATION
# ========================================
YAPPY_CONFIG = {
    "merchantId": "17e73b4c-ed59-4d8a-a5ec-623c4a7a4e07",
    "secretToken": "WVBfRjc2MjFBQ0UtOEY2OS0zRkY1LUE3NkEtMDE5OEU5MUI4QUI1LjE3ZTczYjRjLWVkNTktNGQ4YS1hNWVjLTYyM2M0YTdhNGUwNw==",
    "sandbox": "yes",  # Cambiar a "no" para produccion
}

YAPPY_API_URL = "https://pagosbg.bgeneral.com/validateapikeymerchand"
YAPPY_REDIRECT_BASE = "https://pagosbg.bgeneral.com"


def decode_secret(secret_token):
    """Decode the base64 secret token and extract the signing key"""
    try:
        for attempt in [secret_token, secret_token[:-1]]:
            try:
                padded = attempt + '=' * (4 - len(attempt) % 4) if len(attempt) % 4 else attempt
                decoded = base64.b64decode(padded).decode('utf-8')
                if '.' in decoded:
                    return decoded.split('.')
                else:
                    return [decoded]
            except Exception:
                continue
        return None
    except Exception:
        return None


def generate_signature(config, order_id, total, subtotal, taxes, payment_date):
    """Generate HMAC-SHA256 signature for Yappy"""
    secret_parts = decode_secret(config["secretToken"])
    if not secret_parts:
        return None

    signing_key = secret_parts[0]

    sign_string = (
        f"{total:.2f}"
        f"{config['merchantId']}"
        f"{subtotal:.2f}"
        f"{taxes:.2f}"
        f"{payment_date}"
        f"YAP"
        f"VEN"
        f"{order_id}"
        f"{config['successUrl']}"
        f"{config['failUrl']}"
        f"{config['domainUrl']}"
    )

    signature = hmac.new(
        signing_key.encode('utf-8'),
        sign_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return signature


def get_merchant_api_key(secret_token):
    """Get the API key for the x-api-key header"""
    secret_parts = decode_secret(secret_token)
    if secret_parts and len(secret_parts) > 1:
        return secret_parts[1]
    return None


def create_yappy_payment(order_id, total, subtotal, taxes, domain):
    """Create a Yappy payment and return the redirect URL"""
    config = YAPPY_CONFIG.copy()
    config["domainUrl"] = domain
    config["successUrl"] = f"{domain}/?payment=success&order={order_id}"
    config["failUrl"] = f"{domain}/?payment=fail&order={order_id}"

    # Step 1: Validate merchant with Yappy API
    merchant_secret = get_merchant_api_key(config["secretToken"])
    if not merchant_secret:
        return {"error": "Error decodificando credenciales", "status": False}

    request_body = json.dumps({
        "merchantId": config["merchantId"],
        "urlDomain": config["domainUrl"]
    }).encode('utf-8')

    headers = {
        "x-api-key": merchant_secret,
        "Content-Type": "application/json",
        "version": "P1.0.0"
    }

    try:
        ctx = ssl.create_default_context()

        req = urllib.request.Request(
            YAPPY_API_URL,
            data=request_body,
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            result = json.loads(response.read().decode())

        if not result.get("success"):
            return {
                "error": "Yappy no valido el comercio. Verifica tus credenciales.",
                "details": str(result),
                "status": False
            }

        jwt_token = result.get("accessToken", "")

    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "Sin detalle"
        return {
            "error": f"Error HTTP {e.code} al contactar Yappy",
            "details": error_body,
            "status": False
        }
    except Exception as e:
        return {
            "error": f"Error conectando con Yappy: {str(e)}",
            "status": False
        }

    # Step 2: Build redirect URL with signature
    payment_date = str(int(time.time() * 1000))

    signature = generate_signature(
        config, order_id, total, subtotal, taxes, payment_date
    )

    if not signature:
        return {"error": "Error generando firma de seguridad", "status": False}

    # Build query parameters
    params = {
        "merchantId": config["merchantId"],
        "total": total,
        "subtotal": subtotal,
        "taxes": taxes,
        "paymentDate": payment_date,
        "paymentMethod": "YAP",
        "transactionType": "VEN",
        "orderId": order_id,
        "successUrl": config["successUrl"],
        "failUrl": config["failUrl"],
        "domain": config["domainUrl"],
        "aliasYappy": "",
        "platform": "desarrollopropiophp",
        "jwtToken": jwt_token,
    }

    query_string = urllib.parse.urlencode(params)
    redirect_url = (
        f"{YAPPY_REDIRECT_BASE}"
        f"?sbx={config['sandbox']}"
        f"&donation=no"
        f"&checkoutUrl={urllib.parse.quote(domain, safe='')}"
        f"&signature={signature}"
        f"&{query_string}"
    )

    return {
        "redirectUrl": redirect_url,
        "orderId": order_id,
        "status": True
    }


class handler(BaseHTTPRequestHandler):
    """Vercel Serverless Function handler"""

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length))

            order_id = body.get("orderId", f"XZ-{int(time.time())}")
            total = float(body.get("total", 0))
            subtotal = float(body.get("subtotal", 0))
            taxes = float(body.get("taxes", 0))

            # Get domain from headers
            host = self.headers.get('x-forwarded-host', self.headers.get('Host', ''))
            proto = self.headers.get('x-forwarded-proto', 'https')
            domain = f"{proto}://{host}"

            result = create_yappy_payment(order_id, total, subtotal, taxes, domain)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": f"Error procesando pago: {str(e)}",
                "status": False
            }).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
