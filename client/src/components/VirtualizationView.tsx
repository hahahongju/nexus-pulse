import React, { useState } from 'react';
import { 
  Cpu, 
  Server, 
  Layers, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  Network, 
  Play, 
  Square, 
  RotateCw, 
  Power, 
  PauseCircle, 
  PlayCircle, 
  RefreshCw, 
  AlertTriangle,
  Monitor,
  HardDrive
} from 'lucide-react';
import { VirtualizationInfo, VirtualMachine } from '../types/telemetry';
import { sound } from '../services/sound';

interface VirtualizationViewProps {
  virt: VirtualizationInfo | null;
  onRefresh?: () => void;
}

export const VirtualizationView: React.FC<VirtualizationViewProps> = ({ virt, onRefresh }) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [destroyModalVm, setDestroyModalVm] = useState<VirtualMachine | null>(null);

  if (!virt) {
    return (
      <div className="cyber-card p-8 text-center text-slate-500 font-mono text-xs animate-pulse">
        Scanning hardware virtualization layers and hypervisor topology...
      </div>
    );
  }

  const isBareMetal = virt.role === 'HOST';

  const handleVmAction = async (vmName: string, action: 'start' | 'shutdown' | 'destroy' | 'reboot' | 'pause' | 'resume' | 'reset') => {
    setActionLoading(`${vmName}-${action}`);
    sound.playClick();
    try {
      const res = await fetch(`/api/vms/${vmName}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`VM '${vmName}' ${action} action executed successfully.`);
        sound.playAlertWarning();
        if (onRefresh) onRefresh();
      } else {
        setStatusMsg(`VM Action Error: ${data.message || data.error}`);
      }
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    } finally {
      setActionLoading(null);
      setTimeout(() => setStatusMsg(null), 3500);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Status Message Banner */}
      {statusMsg && (
        <div className="p-3 rounded-lg bg-slate-900 border border-cyan-500/40 text-xs font-mono text-cyan-300 text-center animate-fade-in shadow-lg">
          {statusMsg}
        </div>
      )}

      {/* 1. HARDWARE VIRTUALIZATION & HOST ROLE HERO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Host Role Card */}
        <div className={`cyber-card p-5 border-l-4 ${
          isBareMetal ? 'border-l-emerald-500' : 'border-l-cyan-500'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">SYSTEM VIRTUALIZATION ROLE</span>
              <h3 className="text-base font-bold text-white font-mono mt-1">{virt.roleLabel}</h3>
            </div>
            <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
              isBareMetal ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-cyan-950/80 text-cyan-400 border border-cyan-800'
            }`}>
              {virt.role}
            </span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400">
            Hypervisor Type: <strong className="text-cyan-300">{virt.hypervisor}</strong>
          </div>
        </div>

        {/* Hardware Virt Support (AMD-V / VT-x) */}
        <div className="cyber-card p-5 border-l-4 border-l-purple-500">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">HARDWARE VIRTUALIZATION (CPU)</span>
              <h3 className="text-base font-bold text-purple-300 font-mono mt-1">
                {virt.hardwareVirt.type !== 'None' ? virt.hardwareVirt.type : 'No HW Virtualization'}
              </h3>
            </div>
            <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
              virt.hardwareVirt.supported ? 'bg-purple-950/80 text-purple-400 border border-purple-800' : 'bg-slate-800 text-slate-500'
            }`}>
              {virt.hardwareVirt.supported ? 'HARDWARE ENABLED' : 'DISABLED'}
            </span>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400 flex justify-between">
            <span>KVM Acceleration:</span>
            <span className={`font-bold ${virt.hardwareVirt.kvmDevice ? 'text-emerald-400' : 'text-slate-500'}`}>
              {virt.hardwareVirt.kvmDevice ? 'ACTIVE (/dev/kvm)' : 'UNAVAILABLE'}
            </span>
          </div>
        </div>

        {/* Hypervisor Acceleration */}
        <div className="cyber-card p-5 border-l-4 border-l-cyan-500">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">HYPERVISOR ACCELERATION</span>
              <h3 className="text-base font-bold text-cyan-300 font-mono mt-1">
                {virt.hardwareVirt.kvmDevice ? 'Kernel-based VM (KVM)' : 'Software Emulation'}
              </h3>
            </div>
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400 flex justify-between">
            <span>Active Virtual Machines:</span>
            <span className="text-emerald-400 font-bold">{virt.vms.length} Domains</span>
          </div>
        </div>

      </div>

      {/* 2. VIRTUAL MACHINES (VMs) FLEET MANAGEMENT */}
      <div className="cyber-card p-5">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">KVM / QEMU VIRTUAL MACHINE FLEET</h3>
              <span className="text-xs text-slate-400 font-mono">
                {virt.vms.length} VM Domain(s) registered in Libvirt / QEMU
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              if (onRefresh) onRefresh();
              sound.playClick();
            }}
            className="flex items-center space-x-1.5 px-3 py-1 rounded bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-mono text-slate-300 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh VMs</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2.5 px-3">DOMAIN / VM</th>
                <th className="py-2.5 px-3">STATE</th>
                <th className="py-2.5 px-3">RESOURCES (vCPU / RAM)</th>
                <th className="py-2.5 px-3">HOST PID & USAGE</th>
                <th className="py-2.5 px-3">DISPLAY / DISK</th>
                <th className="py-2.5 px-3 text-center">VM CONTROLS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {virt.vms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-1.5">
                      <Server className="w-8 h-8 text-slate-600 mb-1" />
                      <span className="text-sm font-semibold text-slate-400">No Virtual Machines Detected</span>
                      <span className="text-[11px] text-slate-500">
                        Create a VM via `virt-install`, `virsh`, or `qemu-system-x86_64` to monitor and control it here.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                virt.vms.map((vm, idx) => {
                  const isRunning = vm.status === 'running';
                  const isPaused = vm.status === 'paused';

                  return (
                    <tr key={idx} className="hover:bg-purple-500/5 transition-colors group">
                      {/* Name & ID */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            isRunning ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-600'
                          }`} />
                          <span className="font-bold text-white text-sm">{vm.name}</span>
                        </div>
                        <div className="text-[10px] text-purple-400 font-semibold mt-0.5">Domain ID: {vm.id}</div>
                      </td>

                      {/* State Badge */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded ${
                          isRunning ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                          isPaused ? 'bg-amber-950/80 text-amber-400 border border-amber-800' :
                          'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}>
                          {vm.status}
                        </span>
                      </td>

                      {/* vCPUs & RAM */}
                      <td className="py-3 px-3">
                        <div className="text-slate-200 font-bold">{vm.vcpus} vCPUs</div>
                        <div className="text-[11px] text-purple-300 mt-0.5">
                          {(vm.memoryMb / 1024).toFixed(1)} GB RAM ({vm.memoryMb} MB)
                        </div>
                      </td>

                      {/* Host PID & Live Usage */}
                      <td className="py-3 px-3 text-slate-300">
                        {vm.pid ? (
                          <div>
                            <div>PID: <strong className="text-cyan-400">{vm.pid}</strong></div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              CPU: <strong className="text-amber-400">{vm.cpuPercent}%</strong> | MEM: {vm.memPercent}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">Inactive</span>
                        )}
                      </td>

                      {/* Display & Disk */}
                      <td className="py-3 px-3 text-slate-300 text-[11px]">
                        <div className="flex items-center space-x-1 text-cyan-300">
                          <Monitor className="w-3 h-3" />
                          <span>{vm.displayPort || 'SPICE / VNC'}</span>
                        </div>
                        <div className="text-slate-500 truncate max-w-[180px] mt-0.5" title={vm.diskImage}>
                          {vm.diskImage}
                        </div>
                      </td>

                      {/* Action Controls */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          
                          {/* START VM (if shut off) */}
                          {!isRunning && (
                            <button
                              onClick={() => handleVmAction(vm.name, 'start')}
                              disabled={actionLoading === `${vm.name}-start`}
                              className="px-2.5 py-1 rounded bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-bold transition-all flex items-center space-x-1 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                              title="Start Virtual Machine"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>START</span>
                            </button>
                          )}

                          {/* RUNNING ACTIONS */}
                          {isRunning && (
                            <>
                              {/* Graceful Shutdown */}
                              <button
                                onClick={() => handleVmAction(vm.name, 'shutdown')}
                                disabled={actionLoading === `${vm.name}-shutdown`}
                                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                                title="Graceful ACPI Shutdown"
                              >
                                <Power className="w-3.5 h-3.5 text-amber-400" />
                              </button>

                              {/* Reboot */}
                              <button
                                onClick={() => handleVmAction(vm.name, 'reboot')}
                                disabled={actionLoading === `${vm.name}-reboot`}
                                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                                title="Reboot Virtual Machine"
                              >
                                <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                              </button>

                              {/* Pause / Resume */}
                              {isPaused ? (
                                <button
                                  onClick={() => handleVmAction(vm.name, 'resume')}
                                  disabled={actionLoading === `${vm.name}-resume`}
                                  className="p-1.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 transition-colors"
                                  title="Resume VM Execution"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleVmAction(vm.name, 'pause')}
                                  disabled={actionLoading === `${vm.name}-pause`}
                                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                                  title="Pause / Suspend VM Execution"
                                >
                                  <PauseCircle className="w-3.5 h-3.5 text-amber-300" />
                                </button>
                              )}

                              {/* Force Destroy (Power Off) */}
                              <button
                                onClick={() => {
                                  setDestroyModalVm(vm);
                                  sound.playClick();
                                }}
                                className="p-1.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-400 border border-rose-800 transition-colors"
                                title="Force Stop / Power Off (Destroy)"
                              >
                                <Square className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. DETECTED ENGINES MATRIX & VIRTUAL BRIDGES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Detected Engines */}
        <div className="cyber-card p-5">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              VIRTUALIZATION & RUNTIME STACK ENGINES
            </h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono text-xs">
            {Object.entries(virt.engines).map(([name, installed]) => (
              <div
                key={name}
                className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                  installed
                    ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500'
                }`}
              >
                <span className="capitalize font-bold">{name}</span>
                {installed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-600" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            Active hypervisors: Libvirt QEMU/KVM driver, Docker Container runtime.
          </div>
        </div>

        {/* Virtual Network Bridges */}
        <div className="cyber-card p-5">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
            <Network className="w-5 h-5 text-pink-400" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              VIRTUAL NETWORK BRIDGES & VETH / TAP INTERFACES
            </h4>
          </div>

          <div className="space-y-2.5 max-h-[220px] overflow-y-auto font-mono text-xs">
            {virt.bridges.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No virtual bridge interfaces (e.g. docker0, virbr0, vnet) active.
              </div>
            ) : (
              virt.bridges.map((br, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-cyan-300">{br.iface}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                      {br.type}
                    </span>
                  </div>
                  <div className="text-right text-slate-300">
                    <div>{br.ip4}</div>
                    <div className="text-[10px] text-slate-500">{br.mac || 'Bridge Interface'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Force Destroy Safety Modal */}
      {destroyModalVm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="cyber-card p-6 max-w-md w-full border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-fade-in">
            <div className="flex items-center space-x-3 mb-4 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h4 className="text-base font-bold uppercase tracking-wider text-white">FORCE POWER OFF (DESTROY)</h4>
            </div>

            <p className="text-xs text-slate-300 font-mono mb-4 leading-relaxed">
              Are you sure you want to forcefully terminate virtual machine <strong className="text-cyan-400">{destroyModalVm.name}</strong> (Domain ID: <strong className="text-rose-400">{destroyModalVm.id}</strong>)?
              <br/><br/>
              <span className="text-amber-400">Warning: This cuts virtual power immediately without unmounting filesystems.</span>
            </p>

            <div className="flex justify-end space-x-2 font-mono text-xs pt-3 border-t border-slate-800">
              <button
                onClick={() => setDestroyModalVm(null)}
                className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  handleVmAction(destroyModalVm.name, 'destroy');
                  setDestroyModalVm(null);
                }}
                className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.4)]"
              >
                FORCE POWER OFF
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
