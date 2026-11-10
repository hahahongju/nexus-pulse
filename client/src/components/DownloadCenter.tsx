import React, { useEffect, useRef, useState } from 'react';
import { Download, FolderCog, Link, MessageSquareText, Play, RefreshCw, RotateCcw, Save, Send, Square, Trash2, Video, CheckCircle2 } from 'lucide-react';

type Torrent = { id: number; done: string; have: string; eta: string; uploadKbps: number; downloadKbps: number; ratio: string; status: string; name: string };
type HermesMessage = { role: 'user' | 'assistant'; content: string; createdAt: number };
type DownloadJob = { id: string; kind?: 'youtube' | 'file' | 'hermes-request'; origin?: 'manual' | 'hermes'; url: string; quality: string; status: string; progress: number; speed: string; eta: string; prompt?: string; messages?: HermesMessage[]; relatedJobIds?: string[]; output: string; outputPath: string; error: string };
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
  const [torrentChecked, setTorrentChecked] = useState(false);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [torrentUri, setTorrentUri] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeQuality, setYoutubeQuality] = useState('720p');
  const [downloadDir, setDownloadDir] = useState('');
  const [naturalRequest, setNaturalRequest] = useState('');
  const [hermesReplies, setHermesReplies] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadView, setDownloadView] = useState<'youtube' | 'file' | 'hermes'>('youtube');
  const directoryEdited = useRef(false);

  const refresh = async () => {
    try {
      const [nextStatus, nextJobs] = await Promise.all([
        api<Status>('/api/downloads/status'),
        api<DownloadJob[]>('/api/downloads/youtube'),
      ]);
      setStatus(nextStatus); 
      if (!directoryEdited.current) setDownloadDir(nextStatus.settings.downloadDir);
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

  // Keep RPC recovery independent of storage/YouTube failures. Only one probe
  // runs at a time, and a stalled request cannot prevent future probes.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    const probe = async () => {
      if (stopped || controller) return;
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const result = await api<{ connected: boolean; torrents: Torrent[] }>(
          '/api/downloads/transmission', { signal: controller.signal },
        );
        if (!stopped) {
          setTorrentConnected(result.connected);
          if (result.connected) setTorrents(result.torrents || []);
        }
      } catch {
        if (!stopped) setTorrentConnected(false);
      } finally {
        clearTimeout(timeout);
        controller = null;
        if (!stopped) {
          setTorrentChecked(true);
          timer = setTimeout(probe, 3000);
        }
      }
    };
    const resume = () => { if (document.visibilityState === 'visible') void probe(); };
    void probe();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
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
  const active = visibleTorrents.filter((item) => /download/i.test(item.status)).length + jobs.filter((item) => ['running', 'discovering'].includes(item.status)).length;
  const queuedCount = torrents.filter((item) => /queue|wait|check|verify/i.test(item.status)).length + jobs.filter((item) => item.status === 'queued').length;
  const youtubeJobs = jobs.filter((item) => item.kind === 'youtube' && item.status !== 'completed');
  const fileJobs = jobs.filter((item) => item.kind === 'file' && item.status !== 'completed');
  const hermesJobs = jobs.filter((item) => {
    if (item.kind !== 'hermes-request') return false;
    const relatedIds = item.relatedJobIds || [];
    const allDownloadsCompleted = relatedIds.length > 0 && relatedIds.every((id) => {
      const relatedJob = jobs.find((candidate) => candidate.id === id);
      return (relatedJob?.kind === 'youtube' || relatedJob?.kind === 'file') && relatedJob.status === 'completed';
    });
    return !(item.status === 'awaiting-input' && allDownloadsCompleted);
  });
  const visibleDownloadJobs = downloadView === 'youtube'
    ? youtubeJobs
    : downloadView === 'file'
      ? fileJobs
      : hermesJobs;
  const failedYoutubeJobs = jobs.filter((item) => item.status === 'failed');
  const selectedMount = status?.storage.mounts.find((item) => downloadDir === item.mount || downloadDir.startsWith(`${item.mount}/`));

  return (
    <section className="download-center space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-main)]">다운로드</h2>
        <p className="mt-1 text-sm text-[var(--text-sub)]">완료된 작업은 목록에서 사라집니다. 파일은 저장 위치에 그대로 남습니다.</p>
      </div>
      {/* Ask Hermes Natural Prompt Box */}
      <div className="stitch-panel p-5 border-[var(--border-color)]">
        <div className="flex items-center gap-2 mb-1.5">
          <MessageSquareText className="w-4 h-4 text-[var(--accent-primary)]" />
          <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-main)]">
            원하는 파일 요청하기
          </h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          영상뿐 아니라 ISO, ZIP, 설치 파일, 문서 등 원하는 파일을 설명하면 Hermes가 공식 배포처를 확인하고 다운로드를 시작합니다. 직접 영상 주소는 아래 YouTube 입력란을 이용하세요.
        </p>
        <form 
          className="flex flex-col sm:flex-row gap-2" 
          onSubmit={(event) => { 
            event.preventDefault(); 
            const request = naturalRequest; 
            run(async () => { 
              const result = await api<{ message: string }>('/api/downloads/request', { method: 'POST', body: JSON.stringify({ prompt: request }) }); 
              setNaturalRequest('');
              setDownloadView('hermes');
              return result.message || 'Hermes가 요청을 처리했습니다.'; 
            }, ''); 
          }}
        >
          <input 
            value={naturalRequest} 
            aria-label="원하는 다운로드 설명"
            onChange={(event) => setNaturalRequest(event.target.value)} 
            maxLength={1000}
            placeholder="예: Ubuntu 최신 LTS 서버 ISO 받아줘"
            className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3.5 py-2.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--border-focus)] transition-colors"
          />
          <button 
            disabled={busy || !naturalRequest.trim()} 
            className="px-4 py-2.5 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs font-mono font-semibold disabled:opacity-40 transition-all hover:bg-[var(--accent-primary)] hover:text-black active:translate-y-[1px]"
          >
            <Send className="w-3.5 h-3.5 inline mr-1.5" />
            요청하기
          </button>
        </form>
      </div>

      {/* Metric 4-Grid Status */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { label: '진행 중', val: `${active}개`, col: 'text-[var(--accent-primary)]' },
          { label: '큐 대기', val: `${queuedCount}개`, col: queuedCount ? 'text-amber-400' : 'text-[var(--text-sub)]' },
          { label: '저장 공간', val: !status ? '확인 중' : status.writable ? '저장 가능' : '확인 필요', col: status?.writable ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'YouTube', val: !status ? '확인 중' : status.tools.ytDlp ? '사용 가능' : '설정 필요', col: status?.tools.ytDlp ? 'text-emerald-400' : 'text-amber-400' },
          { label: '토렌트', val: !torrentChecked ? '확인 중' : torrentConnected ? '연결됨' : '재연결 대기 중', col: torrentConnected ? 'text-emerald-400' : 'text-amber-400' },
        ].map((item) => (
          <div key={item.label} className="stitch-panel p-4">
            <div className="text-[10px] tracking-widest text-[var(--text-muted)] font-mono uppercase">{item.label}</div>
            <div className={`mt-1.5 font-mono text-base font-bold tabular-nums ${item.col}`}>{item.val}</div>
          </div>
        ))}
      </div>

      {message && (
        <div role="status" className="rounded-lg border border-[var(--border-focus)] bg-[var(--accent-primary-muted)] px-4 py-2.5 text-xs font-mono text-[var(--accent-primary)]">
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
                  토렌트 다운로드
                </h2>
              </div>
              <button type="button" aria-label="다운로드 상태 새로고침" disabled={busy} onClick={refresh} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors disabled:opacity-40">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <form 
              className="p-3.5 border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-2" 
              onSubmit={(event) => { 
                event.preventDefault(); 
                run(async () => {
                  const result = await api('/api/downloads/transmission', { method: 'POST', body: JSON.stringify({ uri: torrentUri.trim() }) });
                  setTorrentUri('');
                  return result;
                }, 'Torrent를 추가했습니다.');
              }}
            >
              <input 
                value={torrentUri} 
                aria-label="토렌트 주소"
                onChange={(e) => setTorrentUri(e.target.value)} 
                placeholder="magnet:?xt=... 또는 torrent URL" 
                className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-main)] outline-none focus:border-[var(--border-focus)]" 
              />
              <button 
                disabled={busy || !torrentUri.trim()} 
                className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs font-mono font-semibold disabled:opacity-40 hover:bg-[var(--accent-primary)] hover:text-black transition-all"
              >
                <Link className="w-3.5 h-3.5 inline mr-1" />
                추가
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
                      <button type="button" title="시작" aria-label={`${item.name} 시작`} disabled={busy} onClick={() => run(() => api(`/api/downloads/transmission/${item.id}/start`, { method: 'POST' }), 'Torrent를 시작했습니다.')} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded disabled:opacity-40">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="일시정지" aria-label={`${item.name} 일시정지`} disabled={busy} onClick={() => run(() => api(`/api/downloads/transmission/${item.id}/stop`, { method: 'POST' }), 'Torrent를 일시정지했습니다.')} className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded disabled:opacity-40">
                        <Square className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="목록에서만 제거 · 파일 유지" aria-label={`${item.name}을 목록에서만 제거`} disabled={busy} onClick={() => window.confirm('Torrent 작업을 중단하고 목록에서 제거할까요? 다운로드 파일은 유지됩니다.') && run(() => api(`/api/downloads/transmission/${item.id}/remove`, { method: 'POST' }), 'Torrent를 목록에서 제거했습니다. 파일은 유지됩니다.')} className="p-1.5 text-zinc-400 hover:bg-zinc-500/10 rounded disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Torrent와 다운로드 파일 삭제" aria-label={`${item.name}과 파일 삭제`} disabled={busy} onClick={() => window.confirm('Torrent 작업과 다운로드한 파일을 모두 삭제할까요? 되돌릴 수 없습니다.') && run(() => api(`/api/downloads/transmission/${item.id}/delete`, { method: 'POST' }), 'Torrent와 다운로드 파일을 삭제했습니다.')} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded disabled:opacity-40">
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
        <div className="stitch-panel overflow-hidden flex flex-col justify-between order-first">
          <div>
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-rose-400" />
                <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-[var(--text-main)]">
                  다운로드 상태
                </h2>
              </div>
              {failedYoutubeJobs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => run(() => api('/api/downloads/youtube/failed/retry', { method: 'POST' }), `실패 작업 ${failedYoutubeJobs.length}개를 다시 시작했습니다.`)} disabled={busy} className="px-2.5 py-1.5 rounded border border-cyan-500/30 text-[10px] font-mono text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-40 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3 inline" />실패 모두 재시작 ({failedYoutubeJobs.length})
                  </button>
                  <button onClick={() => run(() => api('/api/downloads/youtube/failed/clear', { method: 'POST' }), `실패 작업 ${failedYoutubeJobs.length}개를 정리했습니다.`)} disabled={busy} className="px-2.5 py-1.5 rounded border border-rose-500/30 text-[10px] font-mono text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 flex items-center gap-1">
                    <Trash2 className="w-3 h-3 inline" />실패 모두 정리 ({failedYoutubeJobs.length})
                  </button>
                </div>
              )}
            </div>

            <div role="tablist" aria-label="다운로드 종류" className="flex gap-1 border-b border-[var(--border-color)] p-2">
              {([
                { id: 'youtube', label: 'YouTube', count: youtubeJobs.length },
                { id: 'file', label: '일반 파일', count: fileJobs.length },
                { id: 'hermes', label: 'Hermes 대화', count: hermesJobs.length },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={downloadView === tab.id}
                  onClick={() => setDownloadView(tab.id)}
                  className={`rounded-lg px-3 py-2 text-[10px] font-mono font-semibold transition-colors ${downloadView === tab.id ? 'bg-[var(--accent-primary-muted)] text-[var(--accent-primary)]' : 'text-[var(--text-muted)] hover:bg-white/[0.03] hover:text-[var(--text-main)]'}`}
                >
                  {tab.label} <span className="ml-1 tabular-nums">{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2 text-[10px] text-[var(--text-muted)] font-mono border-b border-[var(--border-color)]">
              일반 파일은 위 요청란에서 Hermes에 요청하세요. YouTube·일반 파일 탭은 실제 다운로드 큐, Hermes 대화 탭은 검색·선택 상태입니다. ‘대기 중’은 큐에 등록됐지만 아직 전송을 시작하지 않은 상태입니다.
            </div>

            {downloadView === 'youtube' && <form 
              className="p-3.5 border-b border-[var(--border-color)] grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2" 
              onSubmit={(event) => { 
                event.preventDefault(); 
                run(async () => {
                  const result = await api('/api/downloads/youtube', { method: 'POST', body: JSON.stringify({ url: youtubeUrl.trim(), quality: youtubeQuality }) });
                  setYoutubeUrl('');
                  return result;
                }, `${status?.qualityOptions.find((item) => item.id === youtubeQuality)?.label || youtubeQuality} 다운로드를 큐에 등록했습니다.`);
              }}
            >
              <input 
                value={youtubeUrl} 
                aria-label="YouTube 영상 주소"
                onChange={(e) => setYoutubeUrl(e.target.value)} 
                placeholder="다운로드 대상 YouTube URL" 
                className="flex-1 min-w-0 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-main)] outline-none focus:border-[var(--border-focus)]" 
              />
              <select 
                value={youtubeQuality} 
                aria-label="다운로드 화질"
                onChange={(event) => setYoutubeQuality(event.target.value)} 
                className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] outline-none font-mono"
              >
                {(status?.qualityOptions || [{ id: '720p', label: '720p 태블릿 권장' }]).map((option) => (
                  <option key={option.id} value={option.id} className="bg-zinc-900">{option.label}</option>
                ))}
              </select>
              <button 
                disabled={busy || !youtubeUrl.trim() || !status?.tools.ytDlp} 
                className="px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-semibold disabled:opacity-40 hover:bg-rose-500 hover:text-white transition-all"
              >
                다운로드
              </button>
            </form>}

            {downloadView === 'youtube' && <div className="px-4 py-2 text-[10px] text-[var(--text-muted)] font-mono border-b border-[var(--border-color)]">
              태블릿에는 720p를 권장합니다. 최고 화질은 원본에 따라 용량이 커질 수 있습니다.
            </div>}

            {downloadView === 'youtube' && !status?.tools.ytDlp && (
              <div className="m-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 font-mono">
                서버에 `yt-dlp`가 없습니다. `sudo apt install yt-dlp ffmpeg` 후 사용 가능합니다.
              </div>
            )}

            <div className="divide-y divide-[var(--border-color)] max-h-[380px] overflow-auto">
              {visibleDownloadJobs.length === 0 && (
                <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  {downloadView === 'youtube' ? '대기 중 또는 진행 중인 YouTube 작업이 없습니다.' : downloadView === 'file' ? '대기 중 또는 진행 중인 일반 파일 작업이 없습니다.' : '답변이 필요한 Hermes 대화가 없습니다. 등록된 다운로드는 각 큐에서 확인할 수 있습니다.'}
                </div>
              )}
              {visibleDownloadJobs.map((job) => (
                <div key={job.id} className="p-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-[var(--text-main)] truncate">{job.outputPath || job.prompt || job.output || job.url}</div>
                      <div className="mt-0.5 text-[10px] font-mono text-[var(--text-muted)] uppercase">
                        {job.kind === 'hermes-request'
                          ? 'HERMES · 파일 탐색 및 큐 등록'
                          : job.kind === 'file'
                            ? `${job.origin === 'hermes' ? 'HERMES · ' : ''}일반 파일`
                            : `${job.origin === 'hermes' ? 'HERMES · ' : ''}QUALITY: ${job.quality || '720p'}`}
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono uppercase font-bold ${job.status === 'failed' ? 'text-rose-400' : job.status === 'paused' ? 'text-amber-400' : 'text-cyan-400'}`}>
                      {({ running: '다운로드 중', discovering: 'Hermes 처리 중', 'awaiting-input': '대화 가능', queued: '대기 중', paused: '일시정지', failed: '실패', cancelled: '취소됨' } as Record<string, string>)[job.status] || job.status}
                    </span>
                  </div>
                  {job.kind === 'hermes-request' && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]/50 px-2.5 py-2 text-[10px] font-mono">
                      <span className="text-[var(--text-muted)]">실제 다운로드 큐:</span>
                      {job.relatedJobIds?.length ? job.relatedJobIds.map((relatedId) => {
                        const related = jobs.find((candidate) => candidate.id === relatedId);
                        if (!related) return null;
                        const kind = related.kind === 'youtube' ? 'YouTube' : '일반 파일';
                        const state = ({ running: '다운로드 중', queued: '큐 대기', paused: '일시정지', failed: '실패', completed: '완료', cancelled: '취소됨' } as Record<string, string>)[related.status] || related.status;
                        return (
                          <button key={related.id} type="button" onClick={() => setDownloadView(related.kind === 'youtube' ? 'youtube' : 'file')} className="rounded border border-[var(--border-color)] px-2 py-1 text-[var(--text-main)] hover:border-[var(--border-focus)]">
                            {kind}: {state}{related.status === 'running' ? ` · ${related.progress || 0}%` : ''} · 큐 보기
                          </button>
                        );
                      }) : <span className="text-[var(--text-sub)]">아직 큐에 등록된 다운로드가 없습니다.</span>}
                    </div>
                  )}
                  {job.kind !== 'hermes-request' && (
                    <div className="h-1 bg-zinc-800 rounded-full mt-2.5 overflow-hidden">
                      <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${job.progress || 0}%` }} />
                    </div>
                  )}
                  {job.status === 'failed' && job.error && (
                    <div className="mt-2 text-[10px] font-mono text-rose-400/90 bg-rose-500/10 border border-rose-500/20 rounded p-2 break-all leading-relaxed">
                      {job.error}
                    </div>
                  )}
                  {job.kind === 'hermes-request' && (
                    <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)]/50 p-2.5">
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1" aria-label="Hermes 대화 기록">
                        {(job.messages || []).map((entry, index) => (
                          <div
                            key={`${entry.createdAt}-${index}`}
                            className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words ${entry.role === 'user'
                              ? 'ml-6 bg-[var(--accent-primary-muted)] text-[var(--text-main)]'
                              : 'mr-6 border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-sub)]'}`}
                          >
                            <div className="mb-1 text-[9px] font-mono font-bold uppercase text-[var(--text-muted)]">
                              {entry.role === 'user' ? '나' : 'Hermes'}
                            </div>
                            {entry.content}
                          </div>
                        ))}
                      </div>
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const reply = (hermesReplies[job.id] || '').trim();
                          if (!reply) return;
                          run(async () => {
                            const result = await api<{ message: string }>(`/api/downloads/hermes/${job.id}/messages`, {
                              method: 'POST',
                              body: JSON.stringify({ message: reply }),
                            });
                            setHermesReplies((current) => ({ ...current, [job.id]: '' }));
                            return result.message;
                          }, '후속 요청을 전달했습니다.');
                        }}
                      >
                        <input
                          value={hermesReplies[job.id] || ''}
                          onChange={(event) => setHermesReplies((current) => ({ ...current, [job.id]: event.target.value }))}
                          disabled={busy || job.status === 'discovering'}
                          maxLength={1000}
                          aria-label="Hermes에게 후속 요청"
                          placeholder={job.status === 'discovering' ? 'Hermes가 응답 중입니다…' : '원하는 결과가 아니면 조건을 수정하거나 계속 요청하세요'}
                          className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--border-focus)] disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={busy || job.status === 'discovering' || !(hermesReplies[job.id] || '').trim()}
                          className="rounded-lg border border-[var(--border-focus)] bg-[var(--accent-primary-muted)] px-3 py-2 text-[var(--accent-primary)] disabled:opacity-40"
                          title="Hermes에게 보내기"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[var(--text-muted)]">
                    <span className="tabular-nums">{job.kind === 'hermes-request' ? (job.speed || '대화 대기') : `${job.progress || 0}% • ${job.speed || '대기'}`}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <span>{job.eta ? `ETA ${job.eta}` : ''}</span>
                      {job.status === 'running' && (
                        <button type="button" title="일시정지" aria-label="작업 일시정지" disabled={busy} onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/pause`, { method: 'POST' }), '작업을 일시정지했습니다.')} className="p-1 text-amber-400 disabled:opacity-40">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {job.status === 'paused' && (
                        <button type="button" title="재개" aria-label="작업 재개" disabled={busy} onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/resume`, { method: 'POST' }), '작업을 재개했습니다.')} className="p-1 text-emerald-400 disabled:opacity-40">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['queued', 'running', 'paused'].includes(job.status) && (
                        <button type="button" title="취소" aria-label="작업 취소" disabled={busy} onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/cancel`, { method: 'POST' }), '작업을 취소했습니다.')} className="p-1 text-rose-400 disabled:opacity-40">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {['failed', 'cancelled'].includes(job.status) && (
                        <button type="button" title="작업 다시 시작" aria-label="작업 다시 시작" disabled={busy} onClick={() => run(() => api(`/api/downloads/youtube/${job.id}/retry`, { method: 'POST' }), '작업을 큐에 다시 등록했습니다.')} className="p-1 text-cyan-400 hover:bg-cyan-500/10 rounded disabled:opacity-40">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {job.kind === 'hermes-request' ? (
                        <button
                          type="button"
                          title="대화 목록에서 정리 · 다운로드 작업과 파일 유지"
                          disabled={busy || job.status === 'discovering'}
                          onClick={() => window.confirm('Hermes 대화만 목록에서 정리할까요? 연결된 다운로드 작업과 파일은 유지됩니다.') && run(() => api(`/api/downloads/youtube/${job.id}/remove`, { method: 'POST' }), 'Hermes 대화를 정리했습니다. 다운로드 작업과 파일은 유지됩니다.')}
                          className="inline-flex items-center gap-1 rounded border border-zinc-500/30 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-500/10 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />대화 정리
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            title="큐에서만 제거 · 파일 유지"
                            disabled={busy || job.status === 'discovering'}
                            onClick={() => window.confirm('작업을 중단하고 큐에서만 제거할까요? 받은 파일과 임시 파일은 유지됩니다.') && run(() => api(`/api/downloads/youtube/${job.id}/remove`, { method: 'POST' }), '큐에서 제거했습니다. 파일은 유지됩니다.')}
                            className="inline-flex items-center gap-1 rounded border border-zinc-500/30 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-500/10 disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />큐만 제거
                          </button>
                          <button
                            type="button"
                            title="큐와 연결된 임시·다운로드 파일 삭제"
                            disabled={busy || job.status === 'discovering'}
                            onClick={() => window.confirm('이 작업의 큐 기록과 연결된 임시 파일·다운로드 파일을 삭제할까요? 되돌릴 수 없습니다.') && run(async () => {
                              const result = await api<{ fileDeleted: boolean }>(`/api/downloads/youtube/${job.id}/delete`, { method: 'POST' });
                              return result.fileDeleted ? '큐와 연결된 파일을 삭제했습니다.' : '큐를 삭제했습니다. 연결된 파일은 없었습니다.';
                            }, '')}
                            className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20 disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5 fill-current" />큐+파일 삭제
                          </button>
                        </>
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
            저장 위치 설정
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
          <div>
            <label htmlFor="download-directory" className="block text-xs text-[var(--text-muted)] mb-1">
              기본 다운로드 폴더
            </label>
            <input 
              value={downloadDir} 
              id="download-directory"
              onChange={(e) => { directoryEdited.current = true; setDownloadDir(e.target.value); }}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-main)] outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <button 
            onClick={() => run(async () => { await api('/api/downloads/settings', { method: 'PUT', body: JSON.stringify({ downloadDir }) }); directoryEdited.current = false; }, '설정을 저장했습니다.')}
            disabled={busy || !downloadDir} 
            className="self-end px-4 py-2 rounded-lg bg-[var(--accent-primary-muted)] border border-[var(--border-focus)] text-[var(--accent-primary)] text-xs font-mono font-semibold disabled:opacity-40 hover:bg-[var(--accent-primary)] hover:text-black transition-all"
          >
            <Save className="w-3.5 h-3.5 inline mr-1" />
            저장 위치 적용
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {status?.storage.mounts.filter(mount => mount.mount.startsWith('/mnt/') || mount.mount.startsWith('/media/') || mount.mount.startsWith('/srv/')).map((mount) => (
            <button 
              key={mount.mount} 
              onClick={() => { directoryEdited.current = true; setDownloadDir(`${mount.mount}/downloads`); }}
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
                {mount.device} · {mount.type} · <span className="text-emerald-400 font-semibold">{bytes(mount.freeBytes)} 여유</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
