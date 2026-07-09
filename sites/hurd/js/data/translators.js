// Translator scenarios for the "06 · Translators" page — modelled on the
// real `settrans` mechanism, the Hurd feature this whole exhibit exists to
// explain: attaching a translator to a filesystem node hands every future
// lookup under that node to a brand-new, ordinary, unprivileged user-space
// program. componentId links each option back to data/components.js so it
// reuses that component's real description, 3D shape and category color.

export const TRANSLATOR_OPTIONS = [

	{
		key: 'ftpfs', componentId: 'ftpfs', label: 'ftpfs',
		command: 'settrans -c /mnt /hurd/ftpfs ftp://ftp.gnu.org/gnu/',
		note: 'Every lookup under /mnt now speaks FTP behind the scenes. `ls /mnt` becomes an FTP directory listing and `cat /mnt/README` becomes a RETR — no FTP-aware code needed in either tool.',
	},
	{
		key: 'nfs', componentId: 'nfs', label: 'nfs',
		command: 'settrans -c /mnt /hurd/nfs remote-host:/export',
		note: 'A remote NFS export now answers every lookup under /mnt as if it were an ordinary local directory.',
	},
	{
		key: 'isofs', componentId: 'isofs', label: 'isofs',
		command: 'settrans -c /mnt /hurd/isofs /dev/sr0',
		note: 'A CD/DVD image now answers lookups under /mnt read-only, in ISO 9660 format — the same translator model, just a different backing store.',
	},
	{
		key: 'unionfs', componentId: 'unionfs', label: 'unionfs',
		command: 'settrans -c /mnt /hurd/unionfs /a /b',
		note: 'Two existing directories, /a and /b, are merged into one view under /mnt. Because translators need no special privilege, any user can set this up.',
	},
	{
		key: 'ext2fs', componentId: 'ext2fs', label: 'ext2fs',
		command: 'settrans -c /mnt /hurd/ext2fs /dev/hd0s2',
		note: 'A second disk partition is mounted under /mnt using the very same ext2fs translator that most likely backs your root filesystem too.',
	},

];

export function getTranslatorOption( key ) {

	return TRANSLATOR_OPTIONS.find( ( o ) => o.key === key ) || null;

}
