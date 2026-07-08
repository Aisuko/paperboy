// Boot sequence of a GNU Hurd system, from bootloader to login prompt.
// componentId links a step to js/data/components.js; null means the step
// is external to the Hurd's own component set (the bootloader, the login
// prompt itself).

export const BOOT_STEPS = [
	{
		id: 'grub', componentId: null, title: 'GRUB loads the kernel',
		description: "GRUB reads /boot from disk and loads GNU Mach plus a handful of “multiboot modules” — most importantly a static ext2fs and the exec server — straight into memory before any of them are even running.",
	},
	{
		id: 'mach-init', componentId: 'gnu-mach', title: 'GNU Mach initializes hardware',
		description: 'GNU Mach takes over the CPU: sets up virtual memory, its IPC subsystem, the scheduler, and probes the boot-device drivers it still keeps in kernel space.',
	},
	{
		id: 'ext2fs-root', componentId: 'ext2fs', title: 'ext2fs mounts the root filesystem',
		description: 'Mach starts the bootstrap task: a statically-linked ext2fs.static, handed the boot device directly. It mounts “/” and becomes the first thing capable of answering a file lookup.',
	},
	{
		id: 'exec-ready', componentId: 'exec', title: 'exec comes online',
		description: 'The exec server starts next so that every program launched from here on — including the rest of the Hurd’s own servers — can be loaded as a normal ELF binary instead of hand-built by Mach.',
	},
	{
		id: 'hurd-init', componentId: 'init', title: '/hurd/init takes over',
		description: 'Mach execs /hurd/init through the new exec server. This is the moment the system gets something like a PID 1: from here, startup is orchestrated in user space, not by the microkernel.',
	},
	{
		id: 'proc-start', componentId: 'proc', title: 'proc starts',
		description: 'init launches the proc server so Mach’s anonymous tasks start getting Unix PIDs, process groups and sessions — bookkeeping every other Unix tool assumes exists.',
	},
	{
		id: 'auth-start', componentId: 'auth', title: 'auth starts',
		description: 'init launches auth right after, giving the system a place to broker identity. From here, servers can start enforcing “who is allowed to do this?” between mutually suspicious tasks.',
	},
	{
		id: 'defpager-start', componentId: 'defpager', title: 'Default pager comes up',
		description: 'The default pager registers with Mach as the memory manager for anonymous memory, so the system can start paging to swap under memory pressure.',
	},
	{
		id: 'pflocal-start', componentId: 'pflocal', title: 'pflocal starts',
		description: 'Unix domain sockets become available, which many of the remaining startup daemons use to talk to each other locally.',
	},
	{
		id: 'rc-scripts', componentId: 'init', title: 'init runs startup scripts',
		description: 'init works through its startup scripts: mounting additional filesystems listed in fstab (ext2fs, isofs, nfs…) and attaching translators like pfinet for networking with settrans.',
	},
	{
		id: 'term-consoles', componentId: 'term', title: 'Consoles come alive',
		description: 'term translators attach to the console and virtual-terminal devices, and getty-equivalents start listening on them for a login.',
	},
	{
		id: 'login', componentId: null, title: 'login prompt appears',
		description: 'With auth, proc, exec, the filesystem and a terminal all in place, the classic “login:” prompt appears — the Hurd is up, and every piece that got it there is still just an ordinary, restartable user-space process.',
	},
];
