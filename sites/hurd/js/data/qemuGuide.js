// Content for the "07 · Run it for real" page. Everything else on this site
// is a simplified, animated model — this page instead points at the real,
// installable GNU Hurd, and is deliberately honest that it stops at
// instructions rather than trying to boot an actual kernel in the browser.

export const QEMU_STEPS = [
	{
		title: 'Install QEMU',
		command: 'sudo apt install qemu-system-x86    # Debian/Ubuntu\nbrew install qemu                  # macOS',
		description: 'QEMU emulates the x86 hardware the Hurd expects — no special hardware or dual-boot required.',
	},
	{
		title: 'Get a Hurd disk image',
		command: '# grab the latest Debian GNU/Hurd installer or\n# prebuilt disk image from the port page linked below',
		description: 'Debian GNU/Hurd ships ready-made installer and live images, which is by far the fastest way in — building the Hurd from source is possible but a much bigger project on its own.',
	},
	{
		title: 'Boot it',
		command: 'qemu-system-i386 -m 1024 \\\n  -hda hurd-disk.img \\\n  -cdrom debian-hurd-install.iso',
		description: 'A 32-bit target and roughly a gigabyte of RAM is the well-trodden path; follow the on-screen installer the first time through.',
	},
	{
		title: 'Boot it again',
		command: 'qemu-system-i386 -m 1024 -hda hurd-disk.img',
		description: 'Once installed, drop the -cdrom and boot straight from the disk image — you now have a real, running GNU Hurd system.',
	},
];

export const QEMU_LINKS = [
	{ label: 'GNU Hurd — running it', href: 'https://www.gnu.org/software/hurd/hurd/running.html' },
	{ label: 'Debian GNU/Hurd port', href: 'https://www.debian.org/ports/hurd/' },
	{ label: 'GNU Hurd documentation', href: 'https://www.gnu.org/software/hurd/hurd/documentation.html' },
];
