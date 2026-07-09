// Simplified, illustrative Mach/Hurd RPC examples shown in the shared
// detail-card's "Example RPC" block. Names loosely follow the real MIG
// interfaces the Hurd is built from (io.defs, fs.defs, auth.defs,
// process.defs, exec.defs) but the field lists are trimmed for readability,
// not full wire signatures — the goal is to make "everything is a message"
// concrete, not to be a reference implementation.

export const IPC_EXAMPLES = {

	'gnu-mach': {
		rpc: 'mach_msg()',
		from: 'any task, to any port it holds a right to',
		request: [ 'msgh_id — which RPC this is', 'port — the send right being called' ],
		reply: [ 'whatever that particular RPC defines' ],
		note: 'Every RPC below is really just a mach_msg() call. Mach only moves bytes between ports — it has no idea what "look up a file" or "who are you" means; that meaning lives entirely in the servers on the other end.',
	},

	auth: {
		rpc: 'auth_getids()',
		from: 'a program checking its own identity',
		request: [ 'auth port (send right)' ],
		reply: [ 'uid[] — effective user ids', 'gid[] — effective group ids' ],
		note: 'This is the entire trust mechanism in miniature: whoever holds a send right to your auth port can ask it who you are, and the answer is only as trustworthy as auth itself.',
	},

	proc: {
		rpc: 'proc_task2pid()',
		from: 'any task holding a send right to proc',
		request: [ 'task port (send right)' ],
		reply: [ 'pid_t — the Unix PID for that task' ],
		note: 'Mach only knows "task ports"; every PID you have ever seen in a Hurd `ps` came from a call shaped exactly like this one.',
	},

	exec: {
		rpc: 'exec_exec()',
		from: 'the shell, immediately after forking',
		request: [ 'file port to the ELF binary', 'argv[]', 'envp[]', 'the new task’s own port' ],
		reply: [ '(none — the task’s image is replaced in place)' ],
		note: 'This single RPC is the entirety of execve() on the Hurd — everything downstream of it just runs as ordinary code inside the now-loaded task.',
	},

	ext2fs: {
		rpc: 'dir_lookup()',
		from: 'any program resolving a path',
		request: [ 'starting directory port', 'pathname component', 'open flags' ],
		reply: [ 'file port (send right) for the resolved node' ],
		note: '`ls`, `cat`, `open()` — almost everything a program does to a filesystem eventually boils down to one or more dir_lookup calls like this one.',
	},

	pfinet: {
		rpc: 'socket_create()',
		from: 'a program calling socket()',
		request: [ 'domain — PF_INET', 'type — SOCK_STREAM / SOCK_DGRAM' ],
		reply: [ 'socket port (send right)' ],
		note: 'libc’s socket() call turns into an ordinary RPC to pfinet, the same way any other translator call would — there is nothing structurally special about "the network" from Mach’s point of view.',
	},

	term: {
		rpc: 'io_write()',
		from: 'any program writing to stdout',
		request: [ 'io port (send right) for this tty', 'byte buffer' ],
		reply: [ 'count — bytes actually written' ],
		note: 'Every character a Hurd program prints to your terminal travels here as an io_write RPC, whether it came from `ls`, `cat`, or a runaway `yes`.',
	},

	defpager: {
		rpc: 'memory_object_data_request()',
		from: 'GNU Mach itself — not a user program',
		request: [ 'memory object port', 'offset', 'length' ],
		reply: [ 'the requested page(s) of data' ],
		note: 'This one runs backwards from the others: Mach is the client here, asking a user-space server to supply pages of "anonymous" memory — the mechanism that makes swap possible with no kernel-resident swap code.',
	},

	crash: {
		rpc: 'exception_raise()',
		from: 'GNU Mach’s exception-delivery mechanism',
		request: [ 'thread port', 'task port', 'exception type & code (e.g. a segfault)' ],
		reply: [ '(handled — often ends in a core dump)' ],
		note: 'A crashing program never talks to this server on purpose; Mach’s own exception mechanism forwards the fault here on the task’s behalf.',
	},

};

export function getIpcExample( id ) {

	return IPC_EXAMPLES[ id ] || null;

}
