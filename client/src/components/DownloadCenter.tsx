import React, { useEffect, useState } from 'react';
import { Download, FolderCog, Link, MessageSquareText, Play, RefreshCw, Save, Send, Square, Trash2, Video, CheckCircle2 } from 'lucide-react';

type Torrent = { id: number; done: string; have: string; eta: string; uploadKbps: number; downloadKbps: number; ratio: string; status: string; name: string };
type YoutubeJob = { id: string; url: string; quality: string; status: string; progress: number; speed: string; eta: string; output: string; outputPath: string; error: string };
type Mount = { device: string; mount: string; type: string; removable: boolean; totalBytes: number; freeBytes: number };
type Status = { settings: { downloadDir: string }; storage: { current: string; mounts: Mount[] }; qualityOptions: Array<{ id: string; label: string }>; tools: { transmission: boolean; ytDlp: boolean }; writable: boolean };

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
      setStatus(nextStatus); 
      setDownloadDir(nextStatus.settings.downloadDir);
      setTorrentConnected(transmission.connected); 
      setTorrents(transmission.torrents || []); 
      setJobs(nextJobs);
    } catch (error) { 
      setMessage(error instanceof Error ? error.message : '상태 조회 실패'); 
    }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); 
    setMessage('');
    try { 
      const result = await work(); 
      setMessage(typeof result === 'string' ? result : success); 
      await refresh(); 
    }
    catch (error) { 
      setMessage(error instanceof Error ? error.message : '작업 실패'); 
    }
    finally { 
      setBusy(false); 
    }
  };

  const visibleTorrents = torrents.filter((item) => item.done !== '100%');
  const active = visibleTorrents.filter((item) => /download/i.test(item.status)).length + jobs.filter((item) => item.status === 'running').length;
  const visibleYoutubeJobs = jobs.filter((item) => item.status !== 'completed');
  const selectedMount = status?.storage.mounts.find((item) => downloadDir === item.mount || downloadDir.startsWith(`${item.mount}/`));

  return (
    <section className="space-y-5">
      {/* Ask Hermes Natural Prompt Box */}
      <div className="stitch-panel p-5 border-[var(--border-color)]">
        <div className="flex items-center gap-2 mb-1.5">
          <MessageSquareText className="w-4 h-4 text-[var(--accent-primary)]" />
          <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-main)]">
            Ask Hermes Downloader
          </h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          원하는 콘텐츠를 자연어로 설명하세요. Hermes가 최적의 미디어를 탐색하여 자동 다운로드 큐에 적재합니다.
        </p>
        <form 
          className="flex flex-col sm:flex-row gap-2" 
          onSubmit={(event) => { 
            event.preventDefault(); 
            const request = naturalRequest; 
            run(async () => { 
              const result = await api<{ message: string }>('/api/downloads/request', { method: 'POST', body: JSON.stringify({ prompt: request }) }); 
              return result.message || 'Hermes가 요청을 처리했습니다.'; 
            }, ''); 
            setNaturalRequest(''); 
          }}
        >
          <input 
            value={naturalRequest} 
            onChange={(event) => setNaturalRequest(event.target.value)} 
            maxLength={500} 
            placeholder="예: 태블릿용 추천 동요 3개 받아줘" 
            className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3.5 py-2.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--border-focus)] transition-colors"
          />
          <button 
            disabled={busy || !naturalRequest.trim()} 
            className="px-4 py-2.5 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs font-mono font-semibold disabled:opacity-40 transition-all hover:bg-[var(--accent-primary)] hover:text-black active:translate-y-[1px]"
          >
            <Send className="w-3.5 h-3.5 inline mr-1.5" />
            REQUEST
          </button>
        </form>
      </div>

      {/* Metric 4-Grid Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'TRANSMISSION DAEMON', val: torrentConnected ? 'ONLINE' : 'OFFLINE', col: torrentConnected ? 'text-emerald-400' : 'text-rose-400' },
          { label: 'ACTIVE QUEUES', val: `${active} ACTIVE`, col: 'text-[var(--accent-primary)]' },
          { label: 'STORAGE TARGET', val: status?.writable ? 'WRITABLE' : 'CHECK PATH', col: status?.writable ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'YOUTUBE ENGINE', val: status?.tools.ytDlp ? 'READY' : 'YT-DLP MISSING', col: status?.tools.ytDlp ? 'text-emerald-400' : 'text-amber-400' },
        ].map((item) => (
          <div key={item.label} className="stitch-panel p-4">
            <div className="text-[10px] tracking-widest text-[var(--text-muted)] font-mono uppercase">{item.label}</div>
            <div className={`mt-1.5 font-mono text-base font-bold tabular-nums ${item.col}`}>{item.val}</div>
          </div>
        ))}
      </div>

      {message && (
        <div className="rounded-lg border border-[var(--border-focus)] bg-[var(--accent-primary-muted)] px-4 py-2.5 text-xs font-mono text-[var(--accent-primary)]">
          {message}
        </div>
      )}

      {/* 2-Column Split: Torrent & YouTube */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        
        {/* Torrent Queue */}
        <div className="stitch-panel overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--accent-primary)]" />
                <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-main)]">
                  BitTorrent Client Queue
                </h2>
              </div>
              <button onClick={refresh} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <form 
              className="p-3.5 border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-2" 
              onSubmit={(event) => { 
                event.preventDefault(); 
                run(() => api('/api/downloads/transmission', { method: 'POST', body: JSON.stringify({ uri: torrentUri }) }), 'Torrent를 추가했습니다.'); 
                setTorrentUri(''); 
              }}
            >
              <input 
                value={torrentUri} 
                onChange={(e) => setTorrentUri(e.target.value)} 
                placeholder="magnet:?xt=... 또는 torrent URL" 
                className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-main)] outline-none focus:border-[var(--border-focus)]" 
              />
              <button 
                disabled={busy || !torrentUri} 
                className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs font-mono font-semibold disabled:opacity-40 hover:bg-[var(--accent-primary)] hover:text-black transition-all"
              >
                <Link className="w-3.5 h-3.5 inline mr-1" />
                ADD
              </button>
            </form>

            <div className="divide-y divide-[var(--border-color)] max-h-[380px] overflow-auto">
              {visibleTorrents.length === 0 && (
                <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  진행 중인 활성 Torrent 작업이 없습니다.
                </div>
              )}
              {visibleTorrents.map((item) => (
                <div key={item.id} className="p-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-main)] truncate font-mono">{item.name}</div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                        {item.status} • {item.have} • ETA {item.eta}
                      </div>
                    </div>
                    <div className="font-mono text-cyan-400 text-xs font-bold tabular-nums">{item.done}</div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[var(--text-sub)] tabular-nums">
                      ↓ {item.downloadKbps} KB/s • ↑ {item.uploadKbps} KB/s
                    </span>
                    <div className="flex gap-1">
                      <button title="시작" onClick={() => run(() => api(`/api/downloads/transmission/${item.id}/start`, { method: 'POST' }), '시작했습니다.')} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button title="일시정지" onClick={() => run(() => api(`/api/downloads/transmission/${item.id}/stop`, { method: 'POST' }), '일시정지했습니다.')} className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded">
                        <Square className="w-3.5 h-3.5" />
                      </button>
                      <button title="목록에서만 제거" onClick={() => window.confirm('파일은 유지하고 목록에서만 제거할까요?') && run(() => api(`/api/downloads/transmission/${item.id}/remove`, { method: 'POST' }), '목록에서 제거했습니다.')} className="p-1.5 text-zinc-400 hover:bg-zinc-500/10 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button title="파일까지 삭제" onClick={() => window.confirm('Torrent와 다운로드한 파일을 모두 삭제할까요?') && run(() => api(`/api/downloads/transmission/${item.id}/delete`, { method: 'POST' }), 'Torrent와 파일을 삭제했습니다.')} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded">
                        <Trash2 className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* YouTube Jobs */}
        <div className="stitch-panel overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-[var(--border-color)] flex items-center gap-2">
              <Video className="w-4 h-4 text-rose-400" />
              <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-main)]">
                YouTube Pipeline
              </h2>
            </div>

            <form 
              className="p-3.5 border-b border-[var(--border-color)] grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2" 
              onSubmit={(event) => { 
                event.preventDefault(); 
                run(() => api('/api/downloads/youtube', { method: 'POST', body: JSON.stringify({ url: youtubeUrl, quality: youtubeQuality }) }), `${status?.qualityOptions.find((item) => item.id === youtubeQuality)?.label || youtubeQuality} 다운로드를 시작했습니다.`); 
                setYoutubeUrl(''); 
              }}
            >
              <input 
                value={youtubeUrl} 
                onChange={(e) => setYoutubeUrl(e.target.value)} 
                placeholder="다운로드 대상 YouTube URL" 
                className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-main)] outline-none focus:border-[var(--border-focus)]" 
              />
              <select 
                value={youtubeQuality} 
                onChange={(event) => setYoutubeQuality(event.target.value)} 
                className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] outline-none font-mono"
              >
                {(status?.qualityOptions || [{ id: '720p', label: '720p 태블릿 권장' }]).map((option) => (
                  <option key={option.id} value={option.id} className="bg-zinc-900">{option.label}</option>
                ))}
              </select>
              <button 
                disabled={busy || !youtubeUrl || !status?.tools.ytDlp} 
                className="px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-semibold disabled:opacity-40 hover:bg-rose-500 hover:text-white transition-all"
              >
                DOWNLOAD
              </button>
            </form>

            <div className="px-4 py-2 text-[10px] text-[var(--text-muted)] font-mono border-b border-[var(--border-color)]">
              ENGINE: H.264 + M4A MP4 • AUDIO 192K MP3
            </div>

            {!status?.tools.ytDlp && (
              <div className="m-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 font-mono">
                서버에 `yt-dlp`가 없습니다. `sudo apt install yt-dlp ffmpeg` 후 사용 가능합니다.
              </div>
            )}

            <div className="divide-y divide-[var(--border-color)] max-h-[380px] overflow-auto">
              {visibleYoutubeJobs.length === 0 && (
                <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  진행 중인 YouTube 다운로드 작업이 없습니다.
                </div>
              )}
              {visibleYoutubeJobs.map((job) => (
                <div key={job.id} className="p-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-[var(--text-main)] truncate">{job.outputPath || job.output || job.url}</div>
                      <div className="mt-0.5 text-[10px] font-mono text-[var(--text-muted)] uppercase">
                        QUALITY: {job.quality || '720p'}
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono uppercase font-bold ${job.status === 'failed' ? 'text-rose-400' : job.status === 'paused' ? 'text-amber-400' : 'text-cyan-400'}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full mt-2.5 overflow-hidden">
                    <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${job.progress || 0}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[var(--text-muted)]">
                    <span className="tabular-nums">{job.progress || 0}% • {job.speed || '대기'}</span>
                    <div className="flex items-center gap-1">
                      <span>{job.eta ? `ETA ${job.eta}` : ''}</span>
                      {job.status === 'running' && (
                        <button title="일시정지" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/pause`, { method: 'POST' }), '일시정지했습니다.')} className="p-1 text-amber-400">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {job.status === 'paused' && (
                        <button title="재개" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/resume`, { method: 'POST' }), '다시 시작했습니다.')} className="p-1 text-emerald-400">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['queued', 'running', 'paused'].includes(job.status) && (
                        <button title="취소" onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/cancel`, { method: 'POST' }), '작업을 취소했습니다.')} className="p-1 text-rose-400">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Storage Settings */}
      <div className="stitch-panel p-5">
        <div className="flex items-center gap-2 mb-3">
          <FolderCog className="w-4 h-4 text-[var(--accent-primary)]" />
          <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-main)]">
            Volume & Target Mount Configuration
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="block text-[10px] font-mono tracking-wider text-[var(--text-muted)] mb-1 uppercase">
              Default Target Storage Directory
            </label>
            <input 
              value={downloadDir} 
              onChange={(e) => setDownloadDir(e.target.value)} 
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-main)] outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <button 
            onClick={() => run(() => api('/api/downloads/settings', { method: 'PUT', body: JSON.stringify({ downloadDir }) }), '설정을 저장했습니다.')} 
            disabled={busy || !downloadDir} 
            className="self-end px-4 py-2 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs font-mono font-semibold disabled:opacity-40 hover:bg-[var(--accent-primary)] hover:text-black transition-all"
          >
            <Save className="w-3.5 h-3.5 inline mr-1" />
            SAVE TARGET
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {status?.storage.mounts.map((mount) => (
            <button 
              key={mount.mount} 
              onClick={() => setDownloadDir(`${mount.mount}/downloads`)} 
              className={`text-left p-3 rounded-lg border transition-colors ${
                selectedMount?.mount === mount.mount 
                  ? 'border-[var(--border-focus)] bg-[var(--accent-primary-muted)]' 
                  : 'border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[var(--border-hover)]'
              }`}
            >
              <div className="font-mono text-xs font-semibold text-[var(--text-main)] flex items-center justify-between">
                <span>{mount.mount}</span>
                {selectedMount?.mount === mount.mount && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
              </div>
              <div className="mt-1 text-[10px] font-mono text-[var(--text-muted)]">
                {mount.device} • {mount.type} • <span className="text-emerald-400 font-semibold">{bytes(mount.freeBytes)} FREE</span> {mount.removable ? '• REMOVABLE' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
