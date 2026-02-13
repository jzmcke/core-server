var http = require('http');
var fs = require('fs');
var path = require('path');
var udp = require('dgram');

// Load WASM blob decoder
const BlobWASM = require('../../blob/wasm/blob_wasm.js');
let blobWasmModule = null;
let wasmReady = false;

// Initialize WASM module
async function initWASM() {
    try {
        blobWasmModule = await BlobWASM();
        const result = blobWasmModule.ccall('wasm_blob_init', 'number', ['number'], [10]);
        if (result === 0) {
            wasmReady = true;
            console.log('✓ WASM blob decoder initialized (jitter buffer: 10 packets)');
            console.log('WASM Module keys:', Object.keys(blobWasmModule));
        } else {
            console.error('✗ Failed to initialize WASM blob decoder');
        }
    } catch (error) {
        console.error('✗ Error loading WASM:', error);
    }
}

initWASM();


const WebSocketServer = require('websocket').server;
var port = 8000;
var host = '0.0.0.0';
var web_clients = [];

var udp_clients = [];

// creating a udp server
var udpserver = udp.createSocket('udp4');
var udpport = 3456;


//emits when socket is ready and listening for datagram msgs
udpserver.on('listening', function () {
    var address = udpserver.address();
    var port = address.port;
    var family = address.family;
    var ipaddr = address.address;
    console.log(`UDP server is running on http://${ipaddr}:${port}`);
});

// Process UDP packet through WASM
function processUDPPacketThroughWASM(msg, rinfo) {
    try {
        // console.log(`Processing ${msg.length} bytes through WASM`);

        // Allocate memory in WASM
        const ptr = blobWasmModule._malloc(msg.length);
        blobWasmModule.HEAPU8.set(msg, ptr);

        // Push packet to jitter buffer
        const numReady = blobWasmModule.ccall('wasm_blob_process_packet', 'number',
            ['number', 'number'], [ptr, msg.length]);

        // console.log(`WASM process result: ready=${numReady}`);

        blobWasmModule._free(ptr);

        // Pull and forward complete packets
        let pulledCount = 0;
        let loopSafety = 0;
        while (blobWasmModule.ccall('wasm_blob_get_ready_count', 'number', [], []) > 0 && loopSafety < 20) {
            loopSafety++;
            const sizePtr = blobWasmModule._malloc(4);
            const dataPtr = blobWasmModule.ccall('wasm_blob_pull_packet', 'number',
                ['number'], [sizePtr]);

            if (dataPtr) {
                const size = blobWasmModule.getValue(sizePtr, 'i32');
                console.log(`WASM pulled packet: ${size} bytes`);
                const packetData = Buffer.from(
                    blobWasmModule.HEAPU8.buffer, dataPtr, size
                );

                // Forward complete blob to WebSocket clients
                forwardCompleteBlob(packetData, rinfo);

                pulledCount++;
            } else {
                // If pull returns NULL, it likely advanced the index but found no packet.
                // We shouldn't loop infinitely if ready_count doesn't decrease.
                // However, C logic advances index. So we might find one next time.
                // But let's log and maybe break to be safe if it happens too much.
                // console.warn(`WASM pull returned NULL (attempt ${loopSafety})`);
            }

            blobWasmModule._free(sizePtr);
        }

        if (pulledCount > 0) console.log(`Processed ${pulledCount} complete packets from WASM`);

    } catch (error) {
        console.error('WASM processing error:', error);
        // Fallback to raw forwarding
        forwardRawPacketToWebSocket(msg, rinfo);
    }
}

// Forward complete defragmented blob to WebSocket clients
function forwardCompleteBlob(blobData, rinfo) {
    const ip = Buffer.from(rinfo['address']);
    const cat_buf = Buffer.alloc(128 - ip.length);
    const send_buf = Buffer.concat([ip, cat_buf, blobData]);

    web_clients.forEach(client => {
        client.send(send_buf);
    });

    console.log(`→ WS: Complete blob (${blobData.length} bytes) to ${web_clients.length} clients`);
}

// Fallback: forward raw packet without defragmentation
function forwardRawPacketToWebSocket(msg, rinfo) {
    const ip = Buffer.from(rinfo['address']);
    const cat_buf = Buffer.alloc(128 - ip.length);
    const send_buf = Buffer.concat([ip, cat_buf, msg]);

    web_clients.forEach(client => {
        client.send(send_buf);
    });

    console.log(`→ WS: Raw packet (${msg.length} bytes, no WASM)`);
}

udpserver.on('message', (msg, rinfo) => {
    console.log(`UDP ← ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);

    // Track UDP clients
    var b_found = false;
    udp_clients.forEach(function (client) {
        if (rinfo['address'] == client['address']) {
            b_found = true;
        }
    });
    if (!b_found) {
        udp_clients.push(rinfo);
        console.log(`  New UDP client: ${rinfo.address}:${rinfo.port}`);
    }

    // Process through WASM if ready, otherwise fallback
    if (wasmReady) {
        processUDPPacketThroughWASM(msg, rinfo);
    } else {
        forwardRawPacketToWebSocket(msg, rinfo);
    }

    // Forward to other UDP clients
    function forward_to_udp(rinfo, msg, client) {
        if (rinfo['address'] != client['address']) {
            var ip = Buffer.from(rinfo['address']);
            var cat_buf = Buffer.alloc(128 - ip.length);
            var send_buf = Buffer.concat([ip, cat_buf, msg]);

            udpserver.send(send_buf, 0, send_buf.length, client['port'], client['address']);
            console.log(`  UDP → ${client['address']}: ${send_buf.length} bytes`);
        }
    }
    udp_clients.forEach(forward_to_udp.bind(null, rinfo, msg));
});

udpserver.bind(udpport);

server = http.createServer(function (request, response) {

    var filePath = '.' + request.url;
    if ((filePath == './')) {
        filePath = './index.html';
    }
    else {
        filePath = './' + request.url;
    }
    var extName = path.extname(filePath);
    var contentType = 'text/html';
    switch (extName) {
        case '.html':
            content_type = 'test/html';
            break;
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
    }
    console.log(filePath);
    fs.access(filePath, fs.constants.R_OK, (err) => {

        if (err) {
            response.writeHead(404);
            response.end();
        }
        else {
            fs.readFile(filePath, function (error, content) {
                console.log(filePath);
                if (error) {
                    response.writeHead(500);
                    response.end();
                }
                else {
                    response.writeHead(200, { 'Content-Type': contentType });
                    response.end(content, 'utf-8');
                }
            });
        }
    });
});

server.listen(port, host, () => {
    console.log(`Websocket server is running on http://${host}:${port}`);
});

const wsServer = new WebSocketServer({ httpServer: server })

var count = 0;
wsServer.on('request', function (request) {
    const connection = request.accept(null, request.origin);
    console.log('Connection request received.')
    web_clients.push(connection);
    connection.on('message', function (message) {
        console.log(`Server got WS msg of size ${message.binaryData.length}`);
        web_clients.forEach(function (client) {
            if (client != connection) {
                var ip = Buffer.from(connection.remoteAddress);
                var cat_buf = Buffer.alloc(128 - ip.length);
                var send_buf = Buffer.concat([ip, cat_buf, message.binaryData]);

                client.send(send_buf);
                // console.log("forwarding websocket msg " + count);
            }
        });

        function forward_to_udp(conn, msg, client) {
            if (conn.remoteAddress != client['address']) {
                var ip = Buffer.from(conn.remoteAddress);
                var cat_buf = Buffer.alloc(128 - ip.length);
                var send_buf = Buffer.concat([ip, cat_buf, msg]);

                udpserver.send(send_buf, 0, send_buf.length, client['port'], client['address']);
                console.log("Forwarding WS to UDP msg " + send_buf.length);
            }
        }
        /* Forward packets to the web-socket clients */
        udp_clients.forEach(forward_to_udp.bind(null, connection, message.binaryData));

    });

    connection.on('close', function (reasonCode, description) {
        console.log('Client has disconnected.');
    });
});
