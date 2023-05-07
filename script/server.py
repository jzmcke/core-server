import http.server
import socketserver
import os
import socket
import asyncio
import websockets
from pathlib import Path
import threading

port = 8000
host = '0.0.0.0'
web_clients = []
udp_clients = []

udp_server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
udp_server.bind((host, 3456))

async def recvfrom(sock, bufsize):
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    def _recvfrom():
        try:
            data, addr = sock.recvfrom(bufsize)
            fut.set_result((data, addr))
        except Exception as exc:
            fut.set_exception(exc)
    loop.call_soon(_recvfrom)
    return await fut


async def udp_echo_server():
    async def handle_udp_echo(data, addr):
        if not addr in udp_clients:
            udp_clients.append(addr)
        print('got')
        for websocket in web_clients:
            ip = addr[0].encode('utf-8')
            print('forward')
            padding = b'\x00' * (128 - len(ip))
            send_buf = ip + padding + data
            await websocket.send(send_buf)

        for client in udp_clients:
            if client != addr:
                ip = addr[0].encode('utf-8')
                padding = b'\x00' * (128 - len(ip))
                send_buf = ip + padding + data
                udp_server.sendto(send_buf, client)

    while True:
        data, addr = await recvfrom(udp_server, 4096)
        
        await handle_udp_echo(data, addr)


class CustomRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path == '/':
            return './index.html'
        else:
            return './' + path

    def guess_type(self, path):
        ext = Path(path).suffix
        if ext == '.js':
            return 'text/javascript'
        elif ext == '.css':
            return 'text/css'
        else:
            return 'text/html'

async def websocket_server(websocket):
    global web_clients
    while True:
        print('Testing')
        if websocket not in web_clients:
            web_clients.append(websocket)

        message = await websocket.recv()
        try:
            async def forward_to_ws(msg, client):
                ip = websocket.remote_address[0].encode('utf-8')
                padding = b'\x00' * (128 - len(ip))
                send_buf = ip + padding + msg
                await client.send(send_buf)

            for client in web_clients:
                if client != websocket:
                    await forward_to_ws(message, client)

            def forward_to_udp(conn, msg, addr):
                if conn.remote_address[0] != addr[0]:
                    ip = conn.remote_address[0].encode('utf-8')
                    padding = b'\x00' * (128 - len(ip))
                    send_buf = ip + padding + msg
                    udp_server.sendto(send_buf, addr)

            for addr in udp_clients:
                forward_to_udp(websocket, message, addr)
        except:
            print('Error forwarding message to websocket clients')

async def main():
    async def webserver():
        async with websockets.serve(websocket_server, host, 8000):
            await asyncio.Future()


    def serve_http():
        with socketserver.TCPServer((host, 8002), CustomRequestHandler) as httpd:
            print(f"HTTP server is running on http://{host}:{port}")
            httpd.serve_forever()

    http_server_thread = threading.Thread(target=serve_http, daemon=True)
    http_server_thread.start()

    await asyncio.gather(udp_echo_server(), webserver())


if __name__ == "__main__":
    asyncio.run(main())
