// Boot sequence of a GNU Hurd system, from bootloader to login prompt.
//
// `componentId` links a step to js/data/components.js; null means the step is
// external to the Hurd's own component set (the bootloader, the login prompt).
// `activates` lists every component the system map should show as *running*
// once the step completes, and `log` is what the left-hand console prints
// while it happens — modelled on a real Debian GNU/Hurd console log.

export const BOOT_STEPS = [
	{
		id: 'grub', componentId: null, activates: [], title: 'GRUB loads the kernel',
		description: 'GRUB reads /boot from disk and loads GNU Mach plus a handful of multiboot modules — most importantly a statically-linked ext2fs and the exec server — straight into memory before any of them are running.',
		log: [
			{ text: 'SeaBIOS (version 1.16.2-1)', kind: 'dim' },
			{ text: 'Booting from Hard Disk...', kind: 'dim' },
			{ text: 'GNU GRUB  version 2.06', kind: 'out' },
			{ text: 'multiboot /boot/gnumach-1.8-486.gz root=device:hd0s1', kind: 'cmd' },
			{ text: 'module /hurd/ext2fs.static --readonly --multiboot-command-line=...', kind: 'cmd' },
			{ text: 'module /lib/ld.so.1 /hurd/exec $(exec-task=task-create)', kind: 'cmd' },
			{ text: 'boot', kind: 'cmd' },
		],
	},
	{
		id: 'mach-init', componentId: 'gnu-mach', activates: [ 'gnu-mach' ], title: 'GNU Mach initialises the machine',
		description: 'GNU Mach takes over the CPU: it sets up virtual memory, its IPC port subsystem, the scheduler, and probes the boot-device drivers that still live in kernel space.',
		log: [
			{ text: 'GNU Mach 1.8', kind: 'ok' },
			{ text: 'Copyright (C) 1991-2023 Free Software Foundation, Inc.', kind: 'dim' },
			{ text: 'AT386 boot: physical memory 1024M', kind: 'out' },
			{ text: 'vm: initialising virtual memory subsystem', kind: 'out' },
			{ text: 'ipc: port space ready, message queues online', kind: 'out' },
			{ text: 'sched: thread scheduler started', kind: 'out' },
			{ text: 'hd0: 4096MB, C/H/S 8322/16/63', kind: 'out' },
		],
	},
	{
		id: 'ext2fs-root', componentId: 'ext2fs', activates: [ 'gnu-mach', 'ext2fs' ], title: 'ext2fs mounts the root filesystem',
		description: 'Mach starts the bootstrap task: the statically-linked ext2fs.static, handed the boot device directly. It mounts "/" and becomes the first thing in the system capable of answering a file lookup.',
		log: [
			{ text: 'Kernel bootstrap: starting bootstrap filesystem', kind: 'out' },
			{ text: 'ext2fs: device:hd0s1: using 1024 pagers', kind: 'out' },
			{ text: 'ext2fs: device:hd0s1: clean, 78214/262144 files', kind: 'ok' },
			{ text: 'ext2fs: / is now answering dir_lookup()', kind: 'ok' },
		],
	},
	{
		id: 'exec-ready', componentId: 'exec', activates: [ 'gnu-mach', 'ext2fs', 'exec' ], title: 'exec comes online',
		description: 'The exec server starts next so that every program launched from here on — including the rest of the Hurd\'s own servers — can be loaded as an ordinary ELF binary instead of being hand-built by Mach.',
		log: [
			{ text: 'Hurd server bootstrap: /hurd/exec', kind: 'out' },
			{ text: 'exec: ELF and a.out loaders registered', kind: 'ok' },
			{ text: 'exec: ready — normal execve() now possible', kind: 'ok' },
		],
	},
	{
		id: 'hurd-init', componentId: 'init', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init' ], title: '/hurd/init takes over',
		description: 'Mach execs /hurd/init through the new exec server. This is the moment the system gets something like a PID 1: from here, startup is orchestrated in user space, not by the microkernel.',
		log: [
			{ text: 'task-create: /hurd/init', kind: 'out' },
			{ text: 'init: hello from user space', kind: 'ok' },
			{ text: 'init: bootstrap ports received from Mach', kind: 'out' },
		],
	},
	{
		id: 'proc-start', componentId: 'proc', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc' ], title: 'proc starts',
		description: 'init launches the proc server, so Mach\'s anonymous tasks start getting Unix PIDs, process groups and sessions — bookkeeping every other Unix tool assumes already exists.',
		log: [
			{ text: 'init: starting /hurd/proc', kind: 'out' },
			{ text: 'proc: registering as the process server', kind: 'ok' },
			{ text: 'proc: pid 1 assigned to /hurd/init', kind: 'out' },
		],
	},
	{
		id: 'auth-start', componentId: 'auth', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc', 'auth' ], title: 'auth starts',
		description: 'init launches auth right after, giving the system a place to broker identity. From here, servers can start enforcing "who is allowed to do this?" between mutually suspicious tasks.',
		log: [
			{ text: 'init: starting /hurd/auth', kind: 'out' },
			{ text: 'auth: registering as the authentication server', kind: 'ok' },
			{ text: 'auth: root identity port issued to init', kind: 'out' },
		],
	},
	{
		id: 'defpager-start', componentId: 'defpager', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc', 'auth', 'defpager' ], title: 'Default pager comes up',
		description: 'The default pager registers with Mach as the memory manager for anonymous memory, so the system can start paging to swap under memory pressure.',
		log: [
			{ text: 'init: starting /hurd/mach-defpager', kind: 'out' },
			{ text: 'defpager: registered as Mach default memory manager', kind: 'ok' },
			{ text: 'defpager: swap on device:hd0s2, 512M', kind: 'out' },
		],
	},
	{
		id: 'pflocal-start', componentId: 'pflocal', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc', 'auth', 'defpager', 'pflocal' ], title: 'pflocal starts',
		description: 'Unix domain sockets become available, which many of the remaining startup daemons use to talk to each other locally.',
		log: [
			{ text: 'settrans -fgap /servers/socket/1 /hurd/pflocal', kind: 'cmd' },
			{ text: 'pflocal: PF_LOCAL socket server ready', kind: 'ok' },
		],
	},
	{
		id: 'rc-scripts', componentId: 'init', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc', 'auth', 'defpager', 'pflocal', 'pfinet', 'isofs', 'null', 'fifo' ], title: 'init runs the startup scripts',
		description: 'init works through its startup scripts: mounting the additional filesystems listed in fstab and attaching translators such as pfinet for networking with settrans.',
		log: [
			{ text: 'init: running /libexec/rc', kind: 'out' },
			{ text: 'settrans -fgap /servers/socket/2 /hurd/pfinet -i eth0 -a 10.0.2.15 -g 10.0.2.2', kind: 'cmd' },
			{ text: 'pfinet: PF_INET stack up on eth0', kind: 'ok' },
			{ text: 'mount: /dev/hd0s3 on /home type ext2fs', kind: 'out' },
			{ text: 'translators: null, zero, fifo attached under /dev', kind: 'out' },
		],
	},
	{
		id: 'term-consoles', componentId: 'term', activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc', 'auth', 'defpager', 'pflocal', 'pfinet', 'isofs', 'null', 'fifo', 'term' ], title: 'Consoles come alive',
		description: 'term translators attach to the console and virtual-terminal devices, and the getty equivalents start listening on them for a login.',
		log: [
			{ text: 'settrans -fgap /dev/console /hurd/term /dev/console device console', kind: 'cmd' },
			{ text: 'term: tty line discipline ready on /dev/console', kind: 'ok' },
			{ text: 'init: spawning getty on tty1 tty2 tty3', kind: 'out' },
		],
	},
	{
		id: 'login', componentId: null, activates: [ 'gnu-mach', 'ext2fs', 'exec', 'init', 'proc', 'auth', 'defpager', 'pflocal', 'pfinet', 'isofs', 'null', 'fifo', 'term' ], title: 'The login prompt appears',
		description: 'With auth, proc, exec, the filesystem and a terminal all in place, the classic "login:" prompt appears — the Hurd is up, and every piece that got it there is still an ordinary, restartable user-space process.',
		log: [
			{ text: '', kind: 'dim' },
			{ text: 'GNU 0.9 (hurd-demo) (tty1)', kind: 'out' },
			{ text: '', kind: 'dim' },
			{ text: 'login: ', kind: 'ok' },
			{ text: 'System up. 13 user-space servers running, 0 of them in the kernel.', kind: 'note' },
		],
	},
];
