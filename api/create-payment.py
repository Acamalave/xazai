"""
XAZAI - Yappy Payment V2 Serverless Function (Vercel)
Handles POST /api/create-payment
New Botón de Pago Yappy integration using web component flow.
"""

import json
import time
import urllib.request
import urllib.error
import ssl
from http.server import BaseHTTPRequestHandler

# ========================================
# YAPPY V2 CONFIGURATION
# ========================================
# Credenciales del Botón de Pago Yappy (generadas en Yappy Comercial → Métodos de cobro → Botón de Pago)
YAPPY_CONFIG = {
    "merchantId": "17e73b4c-ed59-4d8a-a5ec-623c4a7a4e07",
    "domain": "https://xazaipty.com",
    "ipnUrl": "https://xazaipty.com/api/pagosbg",
}

# Yappy V2 API endpoints (Producción)
YAPPY_API_BASE = "https://apipagosbg.bgeneral.cloud"
VALIDATE_MERCHANT_URL = f"{YAPPY_API_BASE}/payments/validate/merchant"
CREATE_ORDER_URL = f"{YAPPY_API_BASE}/payments/payment-wc"


def validate_merchant(merchant_id, domain):
    """
    Step 1: Validate merchant and get authorization token.
    POST /payments/validate/merchant
    """
    request_body = json.dumps({
        "merchantId": merchant_id,
        "urlDomain": domain
    }).encode('utf-8')

    headers = {
        "Content-Type": "application/json"
    }

    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            VALIDATE_MERCHANT_URL,
            data=request_body,
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            result = json.loads(response.read().decode())

        print(f"VALIDATE MERCHANT RESPONSE: {json.dumps(result)}")

        # Check response structure: {status: {code, description}, body: {epochTime, token}}
        status_obj = result.get("status", {})
        body_obj = result.get("body", {})

        if not body_obj.get("token"):
            return {
                "error": f"Yappy no validó el comercio: {status_obj.get('description', 'Sin detalle')}",
                "details": str(result),
                "success": False
            }

        return {
            "success": True,
            "token": body_obj["token"],
            "epochTime": body_obj.get("epochTime", "")
        }

    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "Sin detalle"
        return {
            "error": f"Error HTTP {e.code} validando comercio",
            "details": error_body,
            "success": False
        }
    except Exception as e:
        return {
            "error": f"Error conectando con Yappy: {str(e)}",
            "success": False
        }


def create_order(token, merchant_id, order_id, domain, total, subtotal, taxes, discount, ipn_url, epoch_time=None):
    """
    Step 2: Create payment order using the token from step 1.
    POST /payments/payment-wc
    """
    # Use epochTime from validate response if available, otherwise generate
    if epoch_time:
        payment_date = epoch_time
    else:
        payment_date = int(time.time() * 1000)

    order_body = {
        "merchantId": merchant_id,
        "orderId": order_id,
        "domain": domain,
        "paymentDate": payment_date,
        "aliasYappy": "",
        "ipnUrl": ipn_url,
        "discount": f"{discount:.2f}",
        "taxes": f"{taxes:.2f}",
        "subtotal": f"{subtotal:.2f}",
        "total": f"{total:.2f}"
    }

    # Log for debugging
    print(f"CREATE ORDER REQUEST: {json.dumps(order_body)}")

    request_body = json.dumps(order_body).encode('utf-8')

    headers = {
        "Authorization": token,
        "Content-Type": "application/json"
    }

    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            CREATE_ORDER_URL,
            data=request_body,
            headers=headers,
            method='POST'
        )

        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            result = json.loads(response.read().decode())

        # Check response: {status: {code, description}, body: {transactionId, token, documentName}}
        status_obj = result.get("status", {})
        body_obj = result.get("body", {})

        if not body_obj.get("transactionId"):
            return {
                "error": f"Error creando orden: {status_obj.get('description', 'Sin detalle')}",
                "details": str(result),
                "success": False
            }

        return {
            "success": True,
            "transactionId": body_obj["transactionId"],
            "token": body_obj["token"],
            "documentName": body_obj["documentName"]
        }

    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else "Sin detalle"
        print(f"CREATE ORDER HTTP ERROR {e.code}: {error_body}")
        return {
            "error": f"Error HTTP {e.code} creando orden",
            "details": error_body,
            "success": False
        }
    except Exception as e:
        return {
            "error": f"Error creando orden: {str(e)}",
            "success": False
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
            discount = float(body.get("discount", 0))

            merchant_id = YAPPY_CONFIG["merchantId"]
            domain = YAPPY_CONFIG["domain"]
            ipn_url = YAPPY_CONFIG["ipnUrl"]

            # Step 1: Validate merchant
            validate_result = validate_merchant(merchant_id, domain)

            if not validate_result["success"]:
                self._send_json(200, {
                    "error": validate_result.get("error", "Error validando comercio"),
                    "details": validate_result.get("details", ""),
                    "status": False
                })
                return

            auth_token = validate_result["token"]
            epoch_time = validate_result.get("epochTime", None)

            # Step 2: Create order
            order_result = create_order(
                token=auth_token,
                merchant_id=merchant_id,
                order_id=order_id,
                domain=domain,
                total=total,
                subtotal=subtotal,
                taxes=taxes,
                discount=discount,
                ipn_url=ipn_url,
                epoch_time=epoch_time
            )

            if not order_result["success"]:
                self._send_json(200, {
                    "error": order_result.get("error", "Error creando orden"),
                    "details": order_result.get("details", ""),
                    "status": False
                })
                return

            # Success - return data for the web component
            self._send_json(200, {
                "status": True,
                "transactionId": order_result["transactionId"],
                "token": order_result["token"],
                "documentName": order_result["documentName"],
                "orderId": order_id
            })

        except Exception as e:
            self._send_json(500, {
                "error": f"Error procesando pago: {str(e)}",
                "status": False
            })

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
