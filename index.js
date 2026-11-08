import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('chat.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_offset TEXT UNIQUE,
    content TEXT
  );
`);

const insertMessage = db.prepare('INSERT INTO messages (content, client_offset) VALUES (?, ?)');
const selectMessages = db.prepare('SELECT id, content FROM messages WHERE id > ?');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {}
});

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('chat message', (msg, clientOffset, callback) => {
    let result;
    try {
      result = insertMessage.run(msg, clientOffset);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        callback();
      }
      return;
    }
    io.emit('chat message', msg, Number(result.lastInsertRowid));
    callback();
  });

  if (!socket.recovered) {
    try {
      const rows = selectMessages.all(socket.handshake.auth.serverOffset || 0);
      for (const row of rows) {
        socket.emit('chat message', row.content, row.id);
      }
    } catch (e) {
      // something went wrong
    }
  }
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`server running at http://localhost:${port}`);
});