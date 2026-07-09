// Shell commands modeled for the "05 · Run a command" page. Each command is
// a small, simplified but technically-grounded trace of which Hurd servers
// get an IPC message, in order, before a response reaches the terminal.
// componentId 'bash' is a pseudo-component (the shell itself, not one of the
// real servers in data/components.js) resolved specially by worlds/shell.js.

const FAKE_DIRS = {
	'/': 'bin  boot  dev  etc  hurd  home  lib  servers  usr  var',
	'/home': 'guest',
	'/etc': 'fstab  hostname  motd  passwd',
	'/servers': 'exec  proc  auth  socket/2  socket/26',
};

const FAKE_FILES = {
	'/etc/motd': 'Welcome to a GNU/Hurd system.\nEvery service you can see below is an ordinary, restartable user-space program.',
	'/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nguest:x:1000:1000:guest:/home/guest:/bin/bash',
	'/etc/hostname': 'gnu-hurd-demo',
	'/etc/fstab': '/dev/hd0s1  /  ext2fs  rw  0  1',
};

export const SHELL_COMMANDS = [

	{
		key: 'ls', usage: 'ls [path]', hint: 'list a directory',
		match: ( argv ) => argv[ 0 ] === 'ls',
		steps: [
			{ componentId: 'bash', title: '`ls` gets parsed', description: 'bash splits the line, finds no builtin named ls, and prepares to run /bin/ls as a brand-new program.' },
			{ componentId: 'proc', title: 'A new task gets a PID', description: 'bash forks. The new Mach task is anonymous until the proc server assigns it a PID, a parent PID and a process group — bookkeeping Mach itself has no concept of.' },
			{ componentId: 'exec', title: 'exec loads /bin/ls', description: 'The exec server reads the ELF image, builds the task’s address space and its dynamic linker, then hands control to ls’s entry point.' },
			{ componentId: 'auth', title: 'ls and ext2fs trade identity', description: 'Before honoring a directory lookup, ext2fs asks auth to certify the calling task’s claimed UID/GID — the only place that trust decision is made.' },
			{ componentId: 'ext2fs', title: 'ext2fs looks up the directory', description: 'ext2fs resolves the path and returns the directory’s entries — names, inode numbers, types — straight over Mach IPC.' },
			{ componentId: 'term', title: 'The listing reaches your terminal', description: 'ls formats the entries and writes them to the tty translator backing this session — the thing that actually renders it on screen.' },
		],
		respond( argv ) {

			const path = argv[ 1 ] || '/';
			if ( FAKE_DIRS[ path ] === undefined ) return `ls: cannot access '${ path }': No such file or directory`;
			return FAKE_DIRS[ path ];

		},
	},

	{
		key: 'cat', usage: 'cat [file]', hint: 'print a file',
		match: ( argv ) => argv[ 0 ] === 'cat',
		steps: [
			{ componentId: 'bash', title: '`cat` gets parsed', description: 'bash prepares to run /bin/cat with the given filename as its argument.' },
			{ componentId: 'proc', title: 'A new task gets a PID', description: 'bash forks; proc hands the new task a PID before it becomes cat.' },
			{ componentId: 'exec', title: 'exec loads /bin/cat', description: 'exec loads the cat binary and starts it running with its argv intact.' },
			{ componentId: 'auth', title: 'cat and ext2fs trade identity', description: 'cat’s open() call carries its task’s auth port; ext2fs asks auth to certify the identity before checking permission bits.' },
			{ componentId: 'ext2fs', title: 'ext2fs streams the file', description: 'ext2fs resolves the path and streams the file’s bytes back over Mach IPC, one read reply at a time.' },
			{ componentId: 'term', title: 'The bytes reach stdout', description: 'cat writes what it read straight to the tty translator backing this terminal.' },
		],
		respond( argv ) {

			const path = argv[ 1 ] || '/etc/motd';
			if ( FAKE_FILES[ path ] === undefined ) return `cat: ${ path }: No such file or directory`;
			return FAKE_FILES[ path ];

		},
	},

	{
		key: 'ps', usage: 'ps', hint: 'list processes',
		match: ( argv ) => argv[ 0 ] === 'ps',
		steps: [
			{ componentId: 'bash', title: '`ps` gets parsed', description: 'bash prepares to run /bin/ps.' },
			{ componentId: 'proc', title: 'A new task gets a PID', description: 'bash forks; proc assigns the soon-to-be ps process its own PID first.' },
			{ componentId: 'exec', title: 'exec loads /bin/ps', description: 'exec loads the ps binary and starts it running.' },
			{ componentId: 'proc', title: 'ps asks proc for the process table', description: 'This time proc is queried for data, not bookkeeping: ps calls into it for the live list of PIDs, parent/child links and process groups it’s about to print.' },
			{ componentId: 'term', title: 'The table reaches your terminal', description: 'ps formats the rows it got back from proc and writes them to the tty translator.' },
		],
		respond() {

			return '  PID  PPID CMD\n    1     0 /hurd/init\n   12     1 /hurd/proc\n   13     1 /hurd/auth\n   47     1 bash\n   88    47 ps';

		},
	},

	{
		key: 'whoami', usage: 'whoami', hint: 'print your identity',
		match: ( argv ) => argv[ 0 ] === 'whoami',
		steps: [
			{ componentId: 'bash', title: '`whoami` gets parsed', description: 'bash prepares to run /bin/whoami.' },
			{ componentId: 'proc', title: 'A new task gets a PID', description: 'bash forks; proc assigns the new task a PID.' },
			{ componentId: 'exec', title: 'exec loads /bin/whoami', description: 'exec loads the whoami binary and starts it running.' },
			{ componentId: 'auth', title: 'whoami asks auth who it is', description: 'whoami has no built-in notion of identity; it asks the auth server to decode its own task’s identity port back into a UID/GID pair.' },
			{ componentId: 'term', title: 'The username reaches your terminal', description: 'whoami looks the UID up and writes the matching username to the tty translator.' },
		],
		respond() {

			return 'guest';

		},
	},

	{
		key: 'ping', usage: 'ping [host]', hint: 'send ICMP echoes',
		match: ( argv ) => argv[ 0 ] === 'ping',
		steps: [
			{ componentId: 'bash', title: '`ping` gets parsed', description: 'bash prepares to run /bin/ping with the given host as its argument.' },
			{ componentId: 'proc', title: 'A new task gets a PID', description: 'bash forks; proc assigns the new task a PID.' },
			{ componentId: 'exec', title: 'exec loads /bin/ping', description: 'exec loads the ping binary and starts it running.' },
			{ componentId: 'pfinet', title: 'pfinet opens a raw socket', description: 'ping asks pfinet — the Hurd’s PF_INET translator — to open a raw ICMP socket and dispatch echo requests. The entire TCP/IP stack lives in this one restartable user-space server.' },
			{ componentId: 'term', title: 'Replies reach your terminal', description: 'Each echo reply pfinet hands back gets formatted and written straight to the tty.' },
		],
		respond( argv ) {

			const host = argv[ 1 ] || 'gnu.org';
			return `PING ${ host } (208.118.235.148): 56 data bytes\n64 bytes from 208.118.235.148: icmp_seq=0 ttl=52 time=41.2 ms\n64 bytes from 208.118.235.148: icmp_seq=1 ttl=52 time=39.8 ms\n--- ${ host } ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss`;

		},
	},

	{
		key: 'help', usage: 'help', hint: 'list modeled commands',
		match: ( argv ) => argv[ 0 ] === 'help',
		steps: [
			{ componentId: 'bash', title: 'bash handles it internally', description: 'help is a shell builtin — bash answers it directly out of its own memory. It never sends a single Mach IPC message to any Hurd server, unlike every other command here.' },
		],
		respond() {

			return SHELL_COMMANDS.filter( ( c ) => c.key !== 'help' ).map( ( c ) => `${ c.usage.padEnd( 12 ) } ${ c.hint }` ).join( '\n' ) + '\nclear        clear this terminal';

		},
	},

];

export function parseShellInput( raw ) {

	const trimmed = raw.trim().replace( /\s+/g, ' ' );
	if ( ! trimmed ) return null;
	const argv = trimmed.split( ' ' );
	const spec = SHELL_COMMANDS.find( ( c ) => c.match( argv ) );
	return { raw: trimmed, argv, spec };

}
