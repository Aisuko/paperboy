// Component registry for the GNU Hurd 3D explainer.
// Content grounded in https://www.gnu.org/software/hurd/ and
// https://en.wikipedia.org/wiki/GNU_Hurd (Debian GNU/Hurd "hurd" package
// server list). Kept intentionally to a representative 18 of the Hurd's
// ~2 dozen servers/translators so the 3D scenes stay readable.

export const CATEGORIES = {
	kernel: { label: 'Microkernel', color: 0x8b7bff },
	core: { label: 'Core servers', color: 0xff5da2 },
	io: { label: 'I/O translators', color: 0x35d0ba },
	filesystem: { label: 'Filesystem translators', color: 0xffb84d },
	network: { label: 'Network translators', color: 0x4dc3ff },
	memory: { label: 'Memory management', color: 0xc792ff },
};

export const COMPONENTS = [

	{
		id: 'gnu-mach', name: 'GNU Mach', category: 'kernel',
		blurb: 'The microkernel itself',
		description: "GNU Mach is the microkernel at the base of the Hurd. It knows almost nothing about Unix — no files, no processes, no users. It only provides a handful of primitives: inter-process communication (IPC) via ports and messages, virtual memory management, task/thread scheduling, and the low-level device drivers that still live in kernel space today.",
		responsibilities: [ 'IPC message passing (ports)', 'Virtual memory management', 'Task & thread scheduling', 'Low-level device drivers' ],
		monolithic: 'In Linux these jobs, plus every filesystem, network protocol and process rule, all live together in one privileged kernel binary. GNU Mach deliberately does only this short list and hands everything else to user-space servers.',
		shape: 'core',
	},
	{
		id: 'auth', name: 'auth', category: 'core',
		blurb: 'Identity broker',
		description: "The auth server is the Hurd's only source of truth for ‘who are you?’. Because Mach tasks are otherwise anonymous, two mutually suspicious processes present their claimed UIDs/GIDs to auth, which cross-checks and issues a signed identity token they both trust.",
		responsibilities: [ 'Issues & verifies user/group identity', 'Mediates trust between mutually suspicious tasks', 'Replaces kernel-level permission checks' ],
		monolithic: 'Linux checks UID/GID directly inside the kernel on every syscall; Hurd delegates that check to this one restartable user-space server.',
		shape: 'server',
	},
	{
		id: 'proc', name: 'proc', category: 'core',
		blurb: 'Process bookkeeper',
		description: "Mach only understands ‘tasks’ and ‘threads’ — it has no concept of a Unix process, PID, process group or session. The proc server layers POSIX process semantics on top: PIDs, parent/child relationships, groups and sessions.",
		responsibilities: [ 'Assigns PIDs to Mach tasks', 'Tracks process groups & sessions', 'Implements getppid(), kill(), wait()' ],
		monolithic: "In Linux the scheduler and process table are one thing inside the kernel; Hurd splits ‘run this task’ (Mach) from ‘what Unix process is this’ (proc) into two servers.",
		shape: 'server',
	},
	{
		id: 'exec', name: 'exec', category: 'core',
		blurb: 'Program loader',
		description: 'The exec server implements execve(): given a file translator’s ELF or a.out image, it builds a new Mach task’s address space, loads the binary and its dynamic linker, and hands control to the entry point.',
		responsibilities: [ 'Parses ELF / a.out binaries', 'Builds new task address spaces', 'Hands off to the dynamic linker' ],
		monolithic: "Linux's binfmt_elf loader runs inside the kernel; Hurd's equivalent is an ordinary user-space server any translator can call into.",
		shape: 'server',
	},
	{
		id: 'init', name: 'init', category: 'core',
		blurb: 'First Hurd process — boots everything else',
		description: '/hurd/init is the Hurd’s own init: the first program the bootstrap filesystem execs. It starts the other bootstrap-critical servers, then works through the system’s startup scripts, mounting filesystems and spawning console logins.',
		responsibilities: [ 'First Hurd process, roughly PID 1', 'Starts proc, auth and other core servers', 'Runs startup scripts, spawns logins' ],
		monolithic: 'Plays the same role as sysvinit/systemd PID 1 on Linux, just running as one more replaceable process instead of a kernel-privileged one.',
		shape: 'server',
	},
	{
		id: 'crash', name: 'crash', category: 'core',
		blurb: 'Fatal-error handler',
		description: "When a task dies unexpectedly (illegal instruction, segfault, and so on) Mach's kernel-level exception mechanism forwards the event to the crash server, which can generate a core dump or diagnostic instead of silently killing the task.",
		responsibilities: [ 'Catches Mach exception messages', 'Generates core dumps / diagnostics', 'Keeps fault policy out of the microkernel' ],
		monolithic: "Linux's OOPS and core-dump handling lives inside kernel signal-delivery code; Hurd moves that policy into a replaceable user-space server.",
		shape: 'server',
	},
	{
		id: 'term', name: 'term', category: 'io',
		blurb: 'Terminal (tty/pty) driver',
		description: 'term is a translator that implements the POSIX terminal interface — line discipline, job-control signals, echo — for both real consoles and the pseudo-terminals used by things like SSH sessions and xterm.',
		responsibilities: [ 'POSIX tty/pty semantics', 'Line discipline & job-control signals', 'Backs /dev/tty*, /dev/pts/*' ],
		monolithic: "Linux's tty layer (n_tty line discipline, pty driver) is kernel code; in Hurd it's an ordinary translator process.",
		shape: 'module',
	},
	{
		id: 'null', name: 'null', category: 'io',
		blurb: '/dev/null & /dev/zero',
		description: 'A tiny translator that answers reads with either end-of-file (null) or an endless stream of zero bytes (zero), and silently discards anything written to it.',
		responsibilities: [ 'Implements /dev/null', 'Implements /dev/zero' ],
		monolithic: "A few dozen lines of kernel driver code in Linux; a stand-alone unprivileged process in Hurd.",
		shape: 'module',
	},
	{
		id: 'fifo', name: 'fifo', category: 'io',
		blurb: 'Named pipes',
		description: "Implements POSIX named pipes (FIFOs) as a translator, so any filesystem node can behave like mkfifo(3) expects without the kernel needing special-case code for it.",
		responsibilities: [ 'POSIX named-pipe semantics', 'Blocking / non-blocking rendezvous' ],
		monolithic: "Linux implements FIFOs with in-kernel pipe buffers; Hurd's version is a translator like any filesystem.",
		shape: 'module',
	},
	{
		id: 'symlink', name: 'symlink', category: 'io',
		blurb: 'Symbolic-link translator',
		description: "Provides symbolic-link semantics for filesystems or scenarios that can't natively express them, letting the same ‘attach a translator to a node’ mechanism stand in for a native symlink.",
		responsibilities: [ 'Symlink semantics for translators lacking native support' ],
		monolithic: "Symlinks are a native inode type in most Linux filesystems; Hurd can synthesize the same behaviour entirely in user space.",
		shape: 'module',
	},
	{
		id: 'ext2fs', name: 'ext2fs', category: 'filesystem',
		blurb: 'ext2 filesystem translator',
		description: 'The most common root-filesystem translator: it speaks the ext2 on-disk format and, attached to a device node, exposes a full directory tree over Mach IPC. A statically-linked ext2fs.static is what the bootloader hands control to first.',
		responsibilities: [ 'Reads/writes the ext2 on-disk format', 'Usually the root filesystem translator', 'Started directly at boot' ],
		monolithic: "Linux's ext2/3/4 driver is compiled into (or loaded as a module into) the kernel; Hurd's is a normal process you could strace, restart or replace.",
		shape: 'disk',
	},
	{
		id: 'isofs', name: 'isofs', category: 'filesystem',
		blurb: 'ISO 9660 translator',
		description: 'Reads ISO 9660 filesystems — the format used on CDs and DVDs — exposing their contents through the same translator interface as any other filesystem.',
		responsibilities: [ 'Read-only ISO 9660 (CD/DVD) access' ],
		monolithic: "Linux's isofs kernel module, reimplemented as an unprivileged translator.",
		shape: 'disk',
	},
	{
		id: 'nfs', name: 'nfs', category: 'filesystem',
		blurb: 'Network filesystem client',
		description: 'Lets a remote NFS export be attached anywhere in the local namespace as a translator, so remote files look and behave exactly like local ones to every program.',
		responsibilities: [ 'NFS client protocol', 'Mounts remote exports as local translators' ],
		monolithic: "Linux's NFS client is kernel code; Hurd's is a user-space translator using the same ‘attach anywhere’ mechanism as every other filesystem.",
		shape: 'disk',
	},
	{
		id: 'ftpfs', name: 'ftpfs', category: 'filesystem',
		blurb: 'FTP-as-a-filesystem translator',
		description: 'One of the clearest demonstrations of the translator idea: ftpfs turns a remote FTP server into an ordinary-looking directory tree, so ls, cp and rm work over FTP with no FTP-aware code in those tools.',
		responsibilities: [ 'Presents a remote FTP server as a directory tree', 'No kernel or client changes needed to use it' ],
		monolithic: 'On Linux this needs FUSE (e.g. curlftpfs) or a dedicated client; on Hurd it is just another unprivileged translator, no special kernel support required.',
		shape: 'disk',
	},
	{
		id: 'unionfs', name: 'unionfs', category: 'filesystem',
		blurb: 'Union filesystem translator',
		description: "Overlays several directories into one merged view — the same idea behind Linux's OverlayFS — implemented as a translator that any user can attach without root.",
		responsibilities: [ 'Merges multiple directories into one namespace', 'Any user can create one, no root required' ],
		monolithic: "Linux's OverlayFS is kernel code and typically needs root to mount; Hurd's unionfs is an ordinary user process.",
		shape: 'disk',
	},
	{
		id: 'pfinet', name: 'pfinet', category: 'network',
		blurb: 'TCP/IP protocol translator',
		description: 'pfinet implements the PF_INET protocol family — the whole TCP/IP stack — as a translator sitting on a network device, so socket() calls resolve through IPC to this server instead of kernel code.',
		responsibilities: [ 'TCP/IP protocol stack (PF_INET)', 'Backs socket()/connect()/bind() for network sockets' ],
		monolithic: "Linux's networking stack (netfilter, TCP/IP) is deep inside the kernel; Hurd's is a single restartable user-space server.",
		shape: 'antenna',
	},
	{
		id: 'pflocal', name: 'pflocal', category: 'network',
		blurb: 'Unix domain sockets',
		description: 'Implements PF_LOCAL/PF_UNIX sockets — the mechanism most system daemons use to talk to each other on the same machine — as its own translator, independent of pfinet.',
		responsibilities: [ 'Unix domain socket semantics', 'Local IPC for daemons, independent of TCP/IP' ],
		monolithic: "Linux implements AF_UNIX sockets in the kernel's net/unix code; Hurd splits it out as a server entirely separate from the TCP/IP stack.",
		shape: 'antenna',
	},
	{
		id: 'defpager', name: 'default pager', category: 'memory',
		blurb: 'Default pager (swap)',
		description: 'Mach delegates the policy for anonymous memory — what most people call ‘swap’ — to a user-space memory manager. The default pager is that manager: when physical memory is tight, Mach asks it to page anonymous data out to backing store and back.',
		responsibilities: [ 'Backs anonymous memory pages to disk', 'Implements Mach’s external memory-manager interface' ],
		monolithic: "Linux's swap subsystem (kswapd, the page cache) lives inside the kernel; Mach exports the decision to a normal task instead.",
		shape: 'crystal',
	},

];

export function getComponent( id ) {

	return COMPONENTS.find( ( c ) => c.id === id ) || null;

}

export function componentsByCategory( category ) {

	return COMPONENTS.filter( ( c ) => c.category === category );

}
