import React, { useEffect, useState } from 'react';
import { Download, FolderCog, Link, MessageSquareText, Play, RefreshCw, Save, Send, Square, Trash2, Video } from 'lucide-react';

type Torrent = { id: number; done: string; have: string; eta: string; uploadKbps: number; downloadKbps: number; ratio: string; status: string; name: string };
type YoutubeJob = { id: string; url: string; quality: string; status: string; progress: number; speed: string; eta: string; output: string; outputPath: string; error: string };
type Mount = { device: string; mount: string; type: string; removable: boolean; totalBytes: number; freeBytes: number };
type Status = { settings: { downloadDir: string }; storage: { current: string; mounts: Mount[] }; qualityOptions: Array<{ id: string; label: string }>; tools: { transmission: boolean; ytDlp: boolean }; writable: boolean };

const panel = 'rounded-xl border border-cyan-500/20 bg-slate-950/65 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,.25)]';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '요청에 실패했습니다.');
  return body.data;
}

function bytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

export const DownloadCenter: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [torrentConnected, setTorrentConnected] = useState(false);
  const [jobs, setJobs] = useState<YoutubeJob[]>([]);
  const [torrentUri, setTorrentUri] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeQuality, setYoutubeQuality] = useState('720p');
  const [downloadDir, setDownloadDir] = useState('');
  const [naturalRequest, setNaturalRequest] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [nextStatus, transmission, nextJobs] = await Promise.all([
        api<Status>('/api/downloads/status'),
        api<{ connected: boolean; torrents: Torrent[] }>('/api/downloads/transmission'),
        api<YoutubeJob[]>('/api/downloads/youtube'),
      ]);
      setStatus(nextStatus); setDownloadDir(nextStatus.settings.downloadDir);
      setTorrentConnected(transmission.connected); setTorrents(transmission.torrents || []); setJobs(nextJobs);
    } catch (error) { setMessage(error instanceof Error ? error.message : '상태 조회 실패'); }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage('');
    try { const result = await work(); setMessage(typeof result === 'string' ? result : success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '작업 실패'); }
    finally { setBusy(false); }
  };

  const visibleTorrents = torrents.filter((item) => item.done !== '100%');
  const active = visibleTorrents.filter((item) => /download/i.test(item.status)).length + jobs.filter((item) => item.status === 'running').length;
  const visibleYoutubeJobs = jobs.filter((item) => item.status !== 'completed');
  const selectedMount = status?.storage.mounts.find((item) => downloadDir === item.mount || downloadDir.startsWith(`${item.mount}/`));

  return (
    <section className="space-y-5">
      <div className={`${panel} p-5 border-cyan-400/30`}>
        <div className="flex items-center gap-2 mb-2"><MessageSquareText className="w-5 h-5 text-cyan-300"/><h2 className="font-mono font-bold text-sm tracking-wider">ASK HERMES TO DOWNLOAD</h2></div>
        <p className="text-xs text-slate-400 mb-4">원하는 콘텐츠를 말로 설명하세요. Hermes가 공식 콘텐츠를 찾아 태블릿용 다운로드 큐에 추가합니다.</p>
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={(event) => { event.preventDefault(); const request = naturalRequest; run(async () => { const result = await api<{ message: string }>('/api/downloads/request', { method: 'POST', body: JSON.stringify({ prompt: request }) }); return result.message || 'Hermes가 요청을 처리했습니다.'; }, ''); setNaturalRequest(''); }}>
          <input value={naturalRequest} onChange={(event) => setNaturalRequest(event.target.value)} maxLength={500} placeholder="예: 3세 아기가 좋아할 공룡 동요 5개 받아줘" className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-cyan-400"/>
          <button disabled={busy || !naturalRequest.trim()} className="px-5 py-3 rounded-lg bg-cyan-400/20 border border-cyan-400/50 text-cyan-200 text-xs font-bold disabled:opacity-40"><Send className="w-4 h-4 inline mr-1"/>REQUEST</button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['TRANSMISSION', torrentConnected ? 'ONLINE' : 'OFFLINE', torrentConnected ? 'text-emerald-400' : 'text-rose-400'],
          ['ACTIVE DOWNLOADS', `${active} RUNNING`, 'text-cyan-300'],
          ['STORAGE TARGET', status?.writable ? 'WRITABLE' : 'CHECK PATH', status?.writable ? 'text-emerald-400' : 'text-amber-400'],
          ['YOUTUBE ENGINE', status?.tools.ytDlp ? 'READY' : 'YT-DLP MISSING', status?.tools.ytDlp ? 'text-emerald-400' : 'text-amber-400'],
        ].map(([label, value, color]) => <div key={label} className={`${panel} p-4`}><div className="text-[10px] tracking-[.2em] text-slate-500 font-mono">{label}</div><div className={`mt-2 font-mono text-lg font-bold ${color}`}>{value}</div></div>)}
      </div>

      {message && <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className={`${panel} overflow-hidden`}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between"><div className="flex items-center gap-2"><Download className="w-4 h-4 text-cyan-400"/><h2 className="font-mono font-bold text-sm tracking-wider">TORRENT QUEUE</h2></div><button onClick={refresh} className="p-2 text-slate-400 hover:text-cyan-300"><RefreshCw className="w-4 h-4"/></button></div>
          <form className="p-4 flex flex-col sm:flex-row gap-2" onSubmit={(event) => { event.preventDefault(); run(() => api('/api/downloads/transmission', { method: 'POST', body: JSON.stringify({ uri: torrentUri }) }), 'Torrent를 추가했습니다.'); setTorrentUri(''); }}>
            <input value={torrentUri} onChange={(e) => setTorrentUri(e.target.value)} placeholder="magnet:?xt=... 또는 torrent URL" className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500" />
            <button disabled={busy || !torrentUri} className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold disabled:opacity-40"><Link className="w-4 h-4 inline mr-1"/>ADD</button>
          </form>
          <div className="divide-y divide-slate-800/70 max-h-[420px] overflow-auto">
            {visibleTorrents.length === 0 && <div className="p-8 text-center text-sm text-slate-500">진행 중인 Torrent가 없습니다. 완료 파일은 저장 폴더에 보관됩니다.</div>}
            {visibleTorrents.map((item) => <div key={item.id} className="p-4"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-sm font-semibold truncate">{item.name}</div><div className="text-[11px] font-mono text-slate-500 mt-1">{item.status} · {item.have} · ETA {item.eta}</div></div><div className="font-mono text-cyan-300 text-sm">{item.done}</div></div><div className="mt-3 flex items-center justify-between"><span className="text-[11px] font-mono text-slate-400">↓ {item.downloadKbps} KB/s · ↑ {item.uploadKbps} KB/s</span><div className="flex gap-1"><button title="시작" onClick={() => run(() => api(`/api/downloads/transmission/${item.id}/start`, { method: 'POST' }), '시작했습니다.')} className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded"><Play className="w-4 h-4"/></button><button title="일시정지" onClick={() => run(() => api(`/api/downloads/transmission/${item.id}/stop`, { method: 'POST' }), '일시정지했습니다.')} className="p-2 text-amber-400 hover:bg-amber-500/10 rounded"><Square className="w-4 h-4"/></button><button title="목록에서만 제거" onClick={() => window.confirm('파일은 유지하고 목록에서만 제거할까요?') && run(() => api(`/api/downloads/transmission/${item.id}/remove`, { method: 'POST' }), '목록에서 제거했습니다.')} className="p-2 text-slate-400 hover:bg-slate-500/10 rounded"><Trash2 className="w-4 h-4"/></button><button title="파일까지 삭제" onClick={() => window.confirm('Torrent와 다운로드한 파일을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.') && run(() => api(`/api/downloads/transmission/${item.id}/delete`, { method: 'POST' }), 'Torrent와 파일을 삭제했습니다.')} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded"><Trash2 className="w-4 h-4 fill-current"/></button></div></div></div>)}
          </div>
        </div>

        <div className={`${panel} overflow-hidden`}>
          <div className="p-4 border-b border-slate-800 flex items-center gap-2"><Video className="w-5 h-5 text-rose-400"/><h2 className="font-mono font-bold text-sm tracking-wider">YOUTUBE DOWNLOAD</h2></div>
          <form className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2" onSubmit={(event) => { event.preventDefault(); run(() => api('/api/downloads/youtube', { method: 'POST', body: JSON.stringify({ url: youtubeUrl, quality: youtubeQuality }) }), `${status?.qualityOptions.find((item) => item.id === youtubeQuality)?.label || youtubeQuality} 다운로드를 시작했습니다.`); setYoutubeUrl(''); }}>
            <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="다운로드 권한이 있는 영상 URL" className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500" />
            <select value={youtubeQuality} onChange={(event) => setYoutubeQuality(event.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-rose-500">
              {(status?.qualityOptions || [{ id: '720p', label: '720p 태블릿 권장' }]).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <button disabled={busy || !youtubeUrl || !status?.tools.ytDlp} className="px-4 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold disabled:opacity-40">DOWNLOAD</button>
          </form>
          <div className="mx-4 mb-3 text-[11px] text-slate-400 font-mono">VIDEO · H.264 + M4A · MP4 / AUDIO · MP3 192K</div>
          {!status?.tools.ytDlp && <div className="mx-4 mb-3 text-xs text-amber-300 bg-amber-950/20 border border-amber-500/20 rounded p-3">서버에 `yt-dlp`가 없습니다. `sudo apt install yt-dlp ffmpeg` 후 사용할 수 있습니다.</div>}
          <div className="divide-y divide-slate-800/70 max-h-[420px] overflow-auto">
            {visibleYoutubeJobs.length === 0 && <div className="p-8 text-center text-sm text-slate-500">진행 중인 YouTube 다운로드가 없습니다. 완료 파일은 저장 폴더에 보관됩니다.</div>}
            {visibleYoutubeJobs.map((job) => <div key={job.id} className="p-4"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="text-sm truncate">{job.outputPath || job.output || job.url}</div><div className="mt-1 text-[10px] font-mono text-slate-500 uppercase">QUALITY · {job.quality || '720p'}</div></div><span className={`text-[10px] font-mono uppercase ${job.status === 'failed' ? 'text-rose-400' : job.status === 'paused' ? 'text-amber-400' : 'text-cyan-300'}`}>{job.status}</span></div><div className="h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden"><div className="h-full bg-gradient-to-r from-rose-500 to-cyan-400" style={{ width: `${job.progress || 0}%` }}/></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500"><span>{job.progress || 0}% · {job.speed || '대기'}</span><div className="flex items-center gap-1"><span>{job.eta ? `ETA ${job.eta}` : ''}</span>{job.status === 'running' && <button title="일시정지" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/pause`, { method: 'POST' }), '일시정지했습니다.')} className="p-2 text-amber-400"><Square className="w-4 h-4"/></button>}{job.status === 'paused' && <button title="재개" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/resume`, { method: 'POST' }), '다시 시작했습니다.')} className="p-2 text-emerald-400"><Play className="w-4 h-4"/></button>}{['queued', 'running', 'paused'].includes(job.status) && <button title="취소" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/cancel`, { method: 'POST' }), '작업을 취소했습니다.')} className="p-2 text-rose-400"><Square className="w-4 h-4"/></button>}{!['queued', 'running', 'paused'].includes(job.status) && <button title="목록에서 제거" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/remove`, { method: 'POST' }), '목록에서 제거했습니다.')} className="p-2 text-slate-400"><Trash2 className="w-4 h-4"/></button>}</div></div>{job.error && <div className="mt-2 text-xs text-rose-300 break-words">{job.error}</div>}</div>)}
          </div>
        </div>
      </div>

      <div className={`${panel} p-5`}>
        <div className="flex items-center gap-2 mb-4"><FolderCog className="w-5 h-5 text-cyan-400"/><h2 className="font-mono font-bold text-sm tracking-wider">STORAGE SETTINGS</h2></div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
          <div><label className="block text-[10px] font-mono tracking-wider text-slate-500 mb-1">DEFAULT DOWNLOAD DIRECTORY</label><input value={downloadDir} onChange={(e) => setDownloadDir(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-cyan-500"/></div>
          <button onClick={() => run(() => api('/api/downloads/settings', { method: 'PUT', body: JSON.stringify({ downloadDir }) }), '설정을 저장했습니다. 새 작업부터 적용됩니다.')} disabled={busy || !downloadDir} className="self-end px-5 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold disabled:opacity-40"><Save className="w-4 h-4 inline mr-1"/>SAVE</button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">{status?.storage.mounts.map((mount) => <button key={mount.mount} onClick={() => setDownloadDir(`${mount.mount}/downloads`)} className={`text-left p-3 rounded-lg border transition-colors ${selectedMount?.mount === mount.mount ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}`}><div className="font-mono text-xs text-slate-200">{mount.mount}</div><div className="mt-1 text-[10px] text-slate-500">{mount.device} · {mount.type} · {bytes(mount.freeBytes)} FREE {mount.removable ? '· EXTERNAL' : ''}</div></button>)}</div>
        <p className="mt-4 text-xs text-amber-300/80">저장 장치를 분리하기 전에 다운로드를 정지하세요. 경로 변경은 기존 파일을 이동하지 않으며 새 작업에만 적용됩니다.</p>
      </div>
    </section>
  );
};
