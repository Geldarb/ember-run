const WebSocket = require('ws');
const base = process.argv[2].replace(/^http/, 'ws') + '/ws';
const a = new WebSocket(base);
a.on('message', d => {
  const m = JSON.parse(d);
  console.log('A got', m.t, m.code || '', m.players ? m.players.map(p => p.name).join(',') : '', m.m ? JSON.stringify(m.m) : '');
  if (m.t === 'joined') {
    const b = new WebSocket(base);
    b.on('open', () => b.send(JSON.stringify({ t: 'join', code: m.code, name: 'Bob' })));
    b.on('message', d2 => {
      const n = JSON.parse(d2); console.log('B got', n.t, n.code || '', n.m ? JSON.stringify(n.m) : '');
      if (n.t === 'joined') a.send(JSON.stringify({ t: 'r', m: { t: 'hello', from: 'host' } }));
      if (n.t === 'r') { b.send(JSON.stringify({ t: 'r', to: 1, m: { t: 'hi', back: true } })); }
    });
  }
  if (m.t === 'r') { console.log('RELAY OK both directions'); process.exit(0); }
});
a.on('open', () => a.send(JSON.stringify({ t: 'create', name: 'Alice' })));
setTimeout(() => { console.log('timeout'); process.exit(1); }, 15000);
