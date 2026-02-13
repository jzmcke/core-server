// WASM Blob Decoder Integration
// This module handles loading the WASM blob decoder and processing WebSocket messages

let BlobWASMModule = null;
let wasmReady = false;

// Initialize WASM module
async function initBlobWASM() {
    try {
        console.log('Loading Blob WASM module...');

        // Load the WASM module
        BlobWASMModule = await BlobWASM();

        // Initialize jitter buffer with length of 10 packets
        const jbufLen = 10;
        const result = BlobWASMModule.ccall('wasm_blob_init', 'number', ['number'], [jbufLen]);

        if (result === 0) {
            console.log('Blob WASM initialized successfully');
            wasmReady = true;
        } else {
            console.error('Failed to initialize Blob WASM');
        }
    } catch (error) {
        console.error('Error loading Blob WASM:', error);
    }
}

// Process incoming WebSocket packet through WASM
function processWASMPacket(arrayBuffer) {
    if (!wasmReady) {
        console.warn('WASM not ready, skipping packet');
        return null;
    }

    try {
        const packet = new Uint8Array(arrayBuffer);

        // Allocate memory in WASM
        const ptr = BlobWASMModule._malloc(packet.length);
        BlobWASMModule.HEAPU8.set(packet, ptr);

        // Process packet (pushes to jitter buffer)
        const numReady = BlobWASMModule.ccall('wasm_blob_process_packet', 'number',
            ['number', 'number'], [ptr, packet.length]);

        BlobWASMModule._free(ptr);

        // Pull complete packets if any are ready
        const decodedPackets = [];
        while (BlobWASMModule.ccall('wasm_blob_get_ready_count', 'number', [], []) > 0) {
            const sizePtr = BlobWASMModule._malloc(4); // size_t
            const dataPtr = BlobWASMModule.ccall('wasm_blob_pull_packet', 'number',
                ['number'], [sizePtr]);

            if (dataPtr) {
                const size = BlobWASMModule.getValue(sizePtr, 'i32');
                const packetData = new Uint8Array(BlobWASMModule.HEAPU8.buffer, dataPtr, size);

                // Decode the blob using JavaScript decoder (for now)
                // TODO: Implement full WASM decoding
                const [remainder, decoded, nodename] = blobDecode(packetData.buffer);
                decodedPackets.push({ nodename, data: decoded });

                // Free the packet data
                BlobWASMModule._free(dataPtr);
            }

            BlobWASMModule._free(sizePtr);
        }

        return decodedPackets;
    } catch (error) {
        console.error('Error processing WASM packet:', error);
        return null;
    }
}

// WebSocket message handler
ws.onmessage = function (event) {
    if (wasmReady) {
        // Use WASM decoder with jitter buffer
        const decodedPackets = processWASMPacket(event.data);

        if (decodedPackets && decodedPackets.length > 0) {
            decodedPackets.forEach(packet => {
                handleDecodedBlob(packet.nodename, packet.data);
            });
        }
    } else {
        // Fallback to JavaScript decoder (no jitter buffer)
        const [remainder, decoded, nodename] = blobDecode(event.data);
        handleDecodedBlob(nodename, decoded);
    }
};

// Handle decoded blob data
function handleDecodedBlob(nodename, data) {
    // Update plots with decoded data
    for (let i = 0; i < a_plots.length; i++) {
        a_plots[i].updateWithBlobData(nodename, data);
    }
}

// Initialize WASM on page load
window.addEventListener('load', () => {
    initBlobWASM();
});
