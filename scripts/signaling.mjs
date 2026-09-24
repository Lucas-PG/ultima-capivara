import { PeerServer } from 'peer';

const host = process.env.PEER_HOST || '127.0.0.1';
const port = Number(process.env.PEER_PORT || 9000);
const path = process.env.PEER_PATH || '/peerjs';
if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^\/[a-zA-Z0-9/_-]*$/.test(path)) {
  throw new Error('Invalid PeerJS signaling port or path');
}
const server = PeerServer({ host, port, path });
server.on('listening', () => console.log(`PeerJS signaling: http://${host}:${port}${path}`));
