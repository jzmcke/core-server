var http = require('http');
var fs = require('fs');
var path = require('path');
var udp = require('dgram');


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

udpserver.on('message', (msg, rinfo) => {
    console.log(`server got UDP msg of size ${msg.length} from ${rinfo.address}:${rinfo.port}`);
    var b_found = false;
    /* Check if new client */
    udp_clients.forEach(function (client) {
        if (rinfo['address'] == client['address']) {
            b_found = true;
        }
    });
    if (!b_found) {
        udp_clients.push(rinfo)
    }

    function forward_to_ws(msg, client) {
        var ip = Buffer.from(rinfo['address']);
        var cat_buf = Buffer.alloc(128 - ip.length);
        var send_buf = Buffer.concat([ip, cat_buf, msg]);

        client.send(send_buf);
        console.log("Forwarding UDP to WS msg " + count);
    }
    /* Forward packets to the web-socket clients */
    web_clients.forEach(forward_to_ws.bind(null, msg));

    function forward_to_udp(rinfo, msg, client) {
        if (rinfo['address'] != client['address']) {
            var ip = Buffer.from(rinfo['address']);
            var cat_buf = Buffer.alloc(128 - ip.length);
            var send_buf = Buffer.concat([ip, cat_buf, msg]);

            udpserver.send(send_buf, 0, send_buf.length, client['port'], client['address']);
            console.log("Forwarding UDP " + rinfo['address'] + " to UDP " + client['address'] + " " + send_buf.length);
        }
    }
    /* Forward packets to the web-socket clients */
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
