// The console log for "07 · Boot it for real": what actually scrolls past when
// a Debian GNU/Hurd image is booted under QEMU. Kept close to a real session
// so the page is useful as a reference for someone about to try it.

export const QEMU_COMMAND = 'qemu-system-i386 -m 1024 -drive file=debian-hurd.img,format=raw,cache=writeback -net user -net nic,model=e1000 -vga vmware';

export const QEMU_BOOT_LOG = [
	{ text: QEMU_COMMAND, kind: 'cmd' },
	{ text: 'SeaBIOS (version 1.16.2-1)', kind: 'dim' },
	{ text: 'iPXE (http://ipxe.org) 00:03.0 CB00 PCI2.10 PnP PMM+1FF8C120+1FECC120 CB00', kind: 'dim' },
	{ text: 'Booting from Hard Disk...', kind: 'dim' },
	{ text: '', kind: 'dim' },
	{ text: 'GNU GRUB  version 2.06', kind: 'out' },
	{ text: '  Debian GNU/Hurd', kind: 'out' },
	{ text: '', kind: 'dim' },
	{ text: 'Loading GNU Mach 1.8 ...', kind: 'ok' },
	{ text: 'Loading the Hurd: ext2fs.static ...', kind: 'ok' },
	{ text: 'Loading the Hurd: ld.so.1 /hurd/exec ...', kind: 'ok' },
	{ text: '', kind: 'dim' },
	{ text: 'GNU Mach 1.8', kind: 'out' },
	{ text: 'AT386 boot: physical memory 1024M', kind: 'out' },
	{ text: 'Enabling I/O permission bitmap for kernel ... done', kind: 'out' },
	{ text: 'hd0: 4096MB, C/H/S 8322/16/63', kind: 'out' },
	{ text: 'ext2fs: device:hd0s1: clean, fsck not required', kind: 'ok' },
	{ text: 'task-create: /hurd/init', kind: 'out' },
	{ text: 'proc: registering as the process server', kind: 'ok' },
	{ text: 'auth: registering as the authentication server', kind: 'ok' },
	{ text: 'defpager: registered as Mach default memory manager', kind: 'ok' },
	{ text: 'pflocal: PF_LOCAL socket server ready', kind: 'ok' },
	{ text: 'pfinet: PF_INET stack up on eth0, address 10.0.2.15', kind: 'ok' },
	{ text: 'term: tty line discipline ready on /dev/console', kind: 'ok' },
	{ text: 'INIT: Entering runlevel: 2', kind: 'out' },
	{ text: '', kind: 'dim' },
	{ text: 'Debian GNU/Hurd 2023 hurd-demo tty1', kind: 'out' },
	{ text: 'login: guest', kind: 'ok' },
	{ text: 'Welcome to a real, running GNU Hurd.', kind: 'note' },
	{ text: 'guest@hurd-demo:~$ ', kind: 'ok' },
];

export const QEMU_NOTES = [
	{ text: 'Getting an image', kind: 'head' },
	{ text: 'Pre-built images live at cdimage.debian.org/cdimage/ports/ — look for the debian-hurd-*.img.tar.gz "Hurd" build.', kind: 'out' },
	{ text: 'Notes', kind: 'head' },
	{ text: 'i386 only — there is no 64-bit GNU Mach build to boot.', kind: 'out' },
	{ text: 'Use -net nic,model=e1000: pfinet has no virtio driver.', kind: 'out' },
	{ text: 'The default login is "root" with no password.', kind: 'out' },
];
