var http = require('http');
var fs = require('fs');
var path = require('path');
const WebSocketServer = require('websocket').server;
var port = 8000;
var host = '0.0.0.0';
var data = [];
var web_clients = [];

server = http.createServer(function (request, response) {

    var filePath = '.' + request.url;
    if (filePath == './')
       filePath = './index.html';

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
    else
    {
        fs.readFile(filePath, function(error, content) {
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
    console.log(`Server is running on http://${host}:${port}`);
});

const wsServer = new WebSocketServer({httpServer: server})

var count = 0;
wsServer.on('request', function(request) {
    const connection = request.accept(null, request.origin);
    console.log('Connection request received.')
    web_clients.push(connection);
    connection.on('message', function(message) {       
        web_clients.forEach(function(client) {
            if (client != connection)
            {
                
                var ip = Buffer.from(connection.remoteAddress);
                var cat_buf = Buffer.alloc(128 - ip.length);
                var send_buf = Buffer.concat([ip, cat_buf, message.binaryData]);

                client.send(send_buf);
                console.log("forwarding " + count);
            }
        });
        count = count + 1;
    });

    connection.on('close', function(reasonCode, description) {
        console.log('Client has disconnected.');
    });
});
