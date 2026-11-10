import React, { useState, useEffect } from 'react';
import { Radio, RefreshCw, Power, Plus, Trash2, Wifi } from 'lucide-react';
import { OpenPort } from '../types/telemetry';
import { sound } from '../services/sound';

export const PortScanner: React.FC = () => {
  const [ports, setPorts] = useState<OpenPort[]>([]);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string; mac: string; broadcast: string; port: number }>>([]);
  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [broadcast, setBroadcast] = useState('255.255.255.255');
  const [wolBusy, setWolBusy] = useState('');
  const [message, setMessage] = useState('');

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/ports');
      const data = await res.json();
      setPorts(data.data || []);
    } catch (e) {
      console.error('Failed to fetch open ports:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/network/wol');
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'WOL 장치 조회 실패');
      setDevices(body.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'WOL 장치 조회 실패');
    }
  };

  const addDevice = async (event: React.FormEvent) => {
    event.preventDefault(); setWolBusy('add'); setMessage('');
    try {
      const response = await fetch('/api/network/wol/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mac, broadcast, port: 9 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '장치 등록 실패');
      setName(''); setMac(''); setMessage(`${body.data.name} 장치를 등록했습니다.`); await fetchDevices();
    } catch (error) { setMessage(error instanceof Error ? error.message : '장치 등록 실패'); }
    finally { setWolBusy(''); }
  };

  const wakeDevice = async (id: string) => {
    setWolBusy(id); setMessage(''); sound.playClick();
    try {
      const response = await fetch(`/api/network/wol/devices/${id}/wake`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '매직 패킷 전송 실패');
      setMessage(`${body.data.name}에 매직 패킷 ${body.data.packetsSent}개를 전송했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '매직 패킷 전송 실패'); }
    finally { setWolBusy(''); }
  };

  const removeDevice = async (id: string) => {
    setWolBusy(id); setMessage('');
    try {
      const response = await fetch(`/api/network/wol/devices/${id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '장치 삭제 실패');
      setMessage('WOL 장치를 삭제했습니다.'); await fetchDevices();
    } catch (error) { setMessage(error instanceof Error ? error.message : '장치 삭제 실패'); }
    finally { setWolBusy(''); }
  };

  useEffect(() => {
    fetchPorts(); fetchDevices();
  }, []);

  return (
    <div className="space-y-4">
    <div className="stitch-panel p-5">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">OPEN PORTS & SERVICES</h3>
            <span className="text-xs text-slate-400 font-mono">Listening network sockets & service daemons</span>
          </div>
        </div>

        <button
          onClick={() => {
            fetchPorts();
            sound.playClick();
          }}
          className="flex items-center space-x-1 px-3 py-1 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Scan Ports</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[360px] overflow-y-auto">
        {ports.length === 0 ? (
          <div className="col-span-full py-8 text-center text-slate-500 font-mono text-xs">
            {loading ? 'Scanning socket tables...' : 'No listening ports detected or permission restricted.'}
          </div>
        ) : (
          ports.map((p, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-colors font-mono text-xs">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-bold text-cyan-300 text-sm">:{p.localPort}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 uppercase font-bold">
                  {p.protocol}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] truncate">
                Address: <span className="text-slate-300">{p.localAddress || '0.0.0.0'}</span>
              </div>
              <div className="text-slate-400 text-[11px] truncate mt-0.5">
                Process: <span className="text-purple-300">{p.process || 'N/A'}</span> {p.pid ? `(PID: ${p.pid})` : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    <div className="stitch-panel p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border-color)]">
        <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400"><Power className="w-5 h-5" /></div>
        <div><h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">WAKE ON LAN</h3><span className="text-xs text-slate-400 font-mono">등록한 집 안 장치에 매직 패킷 전송</span></div>
      </div>
      <form onSubmit={addDevice} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-4">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="장치 이름 (예: 거실 PC)" maxLength={60} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400" />
        <input value={mac} onChange={(event) => setMac(event.target.value)} placeholder="MAC (AA:BB:CC:DD:EE:FF)" className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400" />
        <input value={broadcast} onChange={(event) => setBroadcast(event.target.value)} placeholder="브로드캐스트 (192.168.0.255)" className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400" />
        <button disabled={wolBusy === 'add' || !name.trim() || !mac.trim()} className="px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-bold disabled:opacity-40"><Plus className="w-3.5 h-3.5 inline mr-1" />ADD</button>
      </form>
      {message && <div className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">{message}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {devices.length === 0 && <div className="col-span-full py-6 text-center text-xs font-mono text-slate-500">등록된 WOL 장치가 없습니다.</div>}
        {devices.map((device) => <div key={device.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200"><Wifi className="w-3.5 h-3.5 text-amber-400" />{device.name}</div><div className="mt-1 text-[10px] font-mono text-slate-500">{device.mac}</div><div className="text-[10px] font-mono text-slate-500">{device.broadcast}:{device.port}</div></div>
          <button title="장치 삭제" disabled={wolBusy === device.id} onClick={() => window.confirm(`${device.name} 장치를 삭제할까요?`) && removeDevice(device.id)} className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button></div>
          <button disabled={!!wolBusy} onClick={() => wakeDevice(device.id)} className="mt-3 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500 hover:text-black disabled:opacity-40"><Power className={`w-3.5 h-3.5 inline mr-1 ${wolBusy === device.id ? 'animate-pulse' : ''}`} />WAKE</button>
        </div>)}
      </div>
      <p className="mt-4 text-[11px] text-slate-500">대상 장치의 BIOS/UEFI와 운영체제에서 Wake-on-LAN이 활성화되어 있어야 하며, NexusPulse 서버와 같은 LAN에서 가장 안정적으로 동작합니다.</p>
    </div>
    </div>
  );
};
