import React from 'react';
import { 
  Cpu, 
  Server, 
  Layers, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  Network, 
  HardDrive,
  Activity,
  Terminal
} from 'lucide-react';
import { VirtualizationInfo } from '../types/telemetry';

interface VirtualizationViewProps {
  virt: VirtualizationInfo | null;
}

export const VirtualizationView: React.FC<VirtualizationViewProps> = ({ virt }) => {
  if (!virt) {
    return (
      <div className="cyber-card p-8 text-center text-slate-500 font-mono text-xs animate-pulse">
        Scanning hardware virtualization layers and hypervisor topology...
      </div>
    );
  }

  const isBareMetal = virt.role === 'HOST';

  return (
    <div className="space-y-6">
      
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

        {/* Nested Virt & Isolation */}
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
            <span>Nested Virtualization:</span>
            <span className="text-emerald-400 font-bold">SUPPORTED</span>
          </div>
        </div>

      </div>

      {/* 2. DETECTED ENGINES MATRIX & VIRTUAL BRIDGES */}
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
            Supported runtimes: Containerd OCI, Docker daemon, Libvirt/QEMU KVM Hypervisor, LXC Linux Containers.
          </div>
        </div>

        {/* Virtual Network Bridges */}
        <div className="cyber-card p-5">
          <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-slate-800">
            <Network className="w-5 h-5 text-pink-400" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              VIRTUAL NETWORK BRIDGES & VETH INTERFACES
            </h4>
          </div>

          <div className="space-y-2.5 max-h-[220px] overflow-y-auto font-mono text-xs">
            {virt.bridges.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No virtual bridge interfaces (e.g. docker0, virbr0) active.
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
                    <div className="text-[10px] text-slate-500">{br.mac || 'Bridge Adapter'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 3. VIRTUAL MACHINES (VMs) FLEET */}
      <div className="cyber-card p-5">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">KVM / QEMU VIRTUAL MACHINES</h3>
              <span className="text-xs text-slate-400 font-mono">
                {virt.vms.length} Virtual Machine Domain(s) registered
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2.5 px-3">DOMAIN ID</th>
                <th className="py-2.5 px-3">VM NAME</th>
                <th className="py-2.5 px-3">STATE</th>
                <th className="py-2.5 px-3">vCPUs</th>
                <th className="py-2.5 px-3">RAM ALLOCATION</th>
                <th className="py-2.5 px-3">HYPERVISOR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {virt.vms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Server className="w-6 h-6 text-slate-600 mb-1" />
                      <span>No QEMU/KVM virtual machine domains currently active.</span>
                      <span className="text-[11px] text-slate-600">
                        Host is operating in Bare-Metal mode with hardware KVM acceleration ready.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                virt.vms.map((vm, idx) => (
                  <tr key={idx} className="hover:bg-purple-500/5 transition-colors">
                    <td className="py-2.5 px-3 text-purple-400 font-bold">{vm.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">{vm.name}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded ${
                        vm.status === 'running' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' :
                        'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}>
                        {vm.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{vm.vcpus} vCPUs</td>
                    <td className="py-2.5 px-3 text-purple-300">{vm.memoryMb} MB</td>
                    <td className="py-2.5 px-3 text-slate-400">{vm.hypervisor}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
