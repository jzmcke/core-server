import http.server
import socketserver
import os
import socket
import asyncio
import websockets
from pathlib import Path
import threading
import sys
from blob.blob_cffi import BlobJBUF

HTTP_PORT = 8002
WEBSOCKET_PORT = 8000
UDP_PORT = 3456
host = '0.0.0.0'
web_clients = []
udp_clients = []



udp_queue = asyncio.Queue()
ws_queue = asyncio.Queue()

udp_server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
udp_server.bind((host, UDP_PORT))

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

# for now assume only one jbuf
async def udp_receive():
    async def handle_udp_echo(data, udp_client):
        global web_clients
        src_addr = udp_client[0].encode('utf-8')
        udp_ips = [udp_c[0] for udp_c in udp_clients]
        if not src_addr in udp_ips:
            new_jbuf = BlobJBUF(8, b_tickless=True)
            udp_clients.append((src_addr, new_jbuf, udp_client))
            jbuf = new_jbuf
        else:
            jbuf = udp_clients[udp_ips.index(src_addr)][1]
        
        jbuf.push(data)
        res, assembled_data = jbuf.pull()

        if assembled_data is not None:
            for dest_addr, _, client in udp_clients:
                if dest_addr != src_addr:
                    await udp_queue.put((assembled_data, src_addr, client))
    
            for dest_client in web_clients:
                await ws_queue.put((assembled_data, src_addr, dest_client))

    while True:
        data, addr = await recvfrom(udp_server, 4096)
        
        await handle_udp_echo(data, addr)

async def udp_send():
    while True:
        await asyncio.sleep(1)

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

async def websocket_receive(websocket, path):
    global web_clients
    while True:
        if websocket not in web_clients:
            web_clients.append(websocket)
            print(web_clients)

        message = await websocket.recv()
        src_addr = websocket.remote_address[0].encode('utf-8')
        if message is not None:
            for dest_addr, _, client in udp_clients:
                await udp_queue.put((message, src_addr, client))

            for dest_client in web_clients:
                if dest_client != websocket:
                    await ws_queue.put((message, src_addr, dest_client))

async def websocket_sender(websocket, path):
    global web_clients
    async def forward_to_ws(msg, src_addr, client):
        padding = b'\x00' * (128 - len(src_addr))
        send_buf = src_addr + padding + msg
        await client.send(send_buf)

    while True:
        data, src_addr, dest_client = await ws_queue.get()
        try:
            await forward_to_ws(data, src_addr, dest_client)
        except:
            print("Connection is closed, removing from list.")
            web_clients.remove(dest_client)


async def send_rcv_ws_server(websocket, path):
    ws_receiver_task = asyncio.ensure_future(websocket_receive(websocket, path))
    ws_sender_task = asyncio.ensure_future(websocket_sender(websocket, path))
    
    done, pending = await asyncio.wait(
        [ws_receiver_task, ws_receiver_task],
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()


async def main():
    websocket_server = websockets.serve(send_rcv_ws_server, host, WEBSOCKET_PORT)
    udp_sender_task = asyncio.create_task(udp_send())
    udp_receiver_task = asyncio.create_task(udp_receive())
    await websocket_server
    await udp_sender_task
    await udp_receiver_task

def console():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--host_ip', default='192.168.50.115', help='Host to run server on')
    parser.add_argument('--websocket_port', default=8000, help='Port to run websocket server on')
    args = parser.parse_args()
    
    WEBSOCKET_PORT = args.websocket_port

    # Save the host name and websocket port to a file called definitions.js
    with open('definitions.js', 'w') as f:
        f.write(f"var SERVER_IP_ADDRESS = '{args.host_ip}';\n")
        f.write(f"var SERVER_WEBSOCKET_PORT = '{args.websocket_port}';\n")

    
    def serve_http():
        with socketserver.TCPServer(('0.0.0.0', HTTP_PORT), CustomRequestHandler) as httpd:
            print(f"HTTP server is running on http://{host}:{HTTP_PORT}")
            httpd.serve_forever()

    http_server_thread = threading.Thread(target=serve_http) #, daemon=True)
    http_server_thread.start()

    asyncio.get_event_loop().run_until_complete(main())
    asyncio.get_event_loop().run_forever()

if __name__ == "__main__":
    console()
