export type ThemeMode = 'cyber' | 'matrix' | 'synthwave' | 'solar';

export interface SystemOverview {
  hostname: string;
  platform: string;
  type: string;
  release: string;
  arch: string;
  uptime: number;
  nodeVersion: string;
  cpu: {
    manufacturer?: string;
    brand: string;
    cores: number;
    physicalCores: number;
    speedMax: string;
    governor?: string;
  };
  system?: {
    manufacturer: string;
    model: string;
    version: string;
  };
  memory: {
    totalBytes: number;
    totalGb: number;
    layout?: any[];
  };
  networkInterfaces?: Record<string, any[]>;
}

export interface CpuMetrics {
  usage: number;
  cores: number[];
  temperature?: {
    main: number | null;
    cores: number[];
    max?: number | null;
  };
}

export interface MemoryMetrics {
  total: number;
  free: number;
  used: number;
  active: number;
  available: number;
  buffcache: number;
  usedPercent: number;
  swapTotal: number;
  swapUsed: number;
  swapFree: number;
  swapPercent: number;
}

export interface DiskItem {
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  usePercent: number;
  mount: string;
}

export interface DiskIO {
  rIO_sec: number;
  wIO_sec: number;
  rIO: number;
  wIO: number;
}

export interface NetworkInterfaceMetric {
  iface: string;
  operstate: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_sec: number;
  tx_sec: number;
}

export interface NetworkIO {
  rx_sec: number;
  tx_sec: number;
  total_rx: number;
  total_tx: number;
}

export interface SystemMetrics {
  timestamp: number;
  isoTime: string;
  uptime: number;
  loadavg: number[];
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  storage: {
    disks: DiskItem[];
    io: DiskIO;
  };
  network: {
    interfaces: NetworkInterfaceMetric[];
    io: NetworkIO;
  };
  benchmarkActive: boolean;
}

export interface HistoryPoint {
  timestamp: number;
  timeLabel: string;
  cpu: number;
  ram: number;
  swap: number;
  load1: number;
  netRx: number;
  netTx: number;
  diskRead: number;
  diskWrite: number;
}

export interface ProcessItem {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  priority: number;
  memVsz?: number;
  memRss?: number;
  state: string;
  user: string;
  command: string;
}

export interface ProcessResponse {
  all: number;
  running: number;
  blocked?: number;
  sleeping?: number;
  list: ProcessItem[];
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  imageId?: string;
  command?: string;
  created: number | string;
  state: 'running' | 'paused' | 'exited' | 'restarting' | 'dead' | 'created';
  status: string;
  ports?: Array<{ ip?: string; privatePort: number; publicPort?: number; type?: string }>;
  mounts?: Array<{ type?: string; source: string; destination: string; mode?: string; rw?: boolean }>;
  cpuPercent: number;
  memUsage: number; // bytes
  memLimit: number; // bytes
  memPercent: number;
  netRx: number; // bytes
  netTx: number; // bytes
  blockRead: number; // bytes
  blockWrite: number; // bytes
  pids?: number;
}

export interface DockerEngineInfo {
  installed: boolean;
  active: boolean;
  serverVersion?: string;
  apiVersion?: string;
  operatingSystem?: string;
  architecture?: string;
  kernelVersion?: string;
  driver?: string;
  cgroupDriver?: string;
  dockerRootDir?: string;
  containersTotal: number;
  containersRunning: number;
  containersPaused: number;
  containersStopped: number;
  imagesCount: number;
  memTotal?: number;
  ncpu?: number;
}

export interface VirtualMachine {
  id: string | number;
  name: string;
  status: 'running' | 'paused' | 'shut off' | 'crashed' | 'idle' | 'in shutdown';
  vcpus: number;
  memoryMb: number;
  diskImage?: string;
  displayPort?: string;
  vncPort?: number | string;
  pid?: number | null;
  cpuPercent?: number;
  memPercent?: number;
  hypervisor: string;
  autostart?: boolean;
  created?: string;
}

export interface VirtualBridge {
  iface: string;
  ip4?: string;
  mac?: string;
  type: string; // 'docker' | 'libvirt' | 'bridge' | 'veth'
  rxBytes?: number;
  txBytes?: number;
  state: string;
}

export interface VirtualizationInfo {
  role: 'HOST' | 'GUEST' | 'CONTAINER';
  roleLabel: string;
  hypervisor: string; // 'None (Bare Metal)' | 'KVM' | 'QEMU' | 'VMware' | 'VirtualBox' | 'WSL' | 'Docker' | etc.
  hardwareVirt: {
    supported: boolean;
    type: 'AMD-V (SVM)' | 'Intel VT-x (VMX)' | 'None';
    kvmDevice: boolean;
    nestedVirt: boolean;
    iommu: boolean;
  };
  engines: {
    docker: boolean;
    podman: boolean;
    containerd: boolean;
    libvirt: boolean;
    qemu: boolean;
    lxc: boolean;
  };
  vms: VirtualMachine[];
  bridges: VirtualBridge[];
}

export interface ContainersOverview {
  docker: DockerEngineInfo;
  containers: DockerContainer[];
  virtualization: VirtualizationInfo;
}

export interface OpenPort {
  protocol: string;
  localAddress: string;
  localPort: string;
  process?: string;
  pid?: number;
}

export interface AlertItem {
  id: string;
  severity: 'WARNING' | 'CRITICAL';
  metric: string;
  value: string;
  threshold: string;
  message: string;
  timestamp: string;
}

export interface AlertRules {
  cpuWarning: number;
  cpuCritical: number;
  ramWarning: number;
  ramCritical: number;
  diskWarning: number;
  diskCritical: number;
  loadCritical?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'BENCHMARK';
  message: string;
  source: string;
}
