import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '..');
const vendorDir = join(pkgRoot, 'vendor', 'ktx');
const KTX_VERSION = '4.3.2';

const WINDOWS_INSTALLER = `KTX-Software-${KTX_VERSION}-Windows-x64.exe`;
const WINDOWS_INSTALLER_URL = `https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VERSION}/${WINDOWS_INSTALLER}`;
const LINUX_ARCHIVE = `KTX-Software-${KTX_VERSION}-Linux-x86_64.tar.bz2`;
const LINUX_ARCHIVE_URL = `https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VERSION}/${LINUX_ARCHIVE}`;

function ktxReady() {
	return existsSync(join(vendorDir, process.platform === 'win32' ? 'ktx.exe' : 'ktx'));
}

async function downloadFile(url, destination) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
	}

	await pipeline(response.body, createWriteStream(destination));
}

function resolve7zip() {
	const path7za = require('7zip-bin').path7za;
	if (!existsSync(path7za)) {
		throw new Error(`Bundled 7za not found at ${path7za}. Re-run yarn install.`);
	}

	return path7za;
}

function copyBinDirectory(sourceDir) {
	mkdirSync(vendorDir, { recursive: true });
	for (const entry of readdirSync(sourceDir)) {
		cpSync(join(sourceDir, entry), join(vendorDir, entry));
	}
}

function installWindowsFrom7zip(installerPath) {
	const extractDir = join(pkgRoot, '.ktx-extract');
	rmSync(extractDir, { recursive: true, force: true });
	mkdirSync(extractDir, { recursive: true });

	execFileSync(resolve7zip(), ['x', installerPath, `-o${extractDir}`, '-y'], { stdio: 'inherit' });
	copyBinDirectory(join(extractDir, 'bin'));
	rmSync(extractDir, { recursive: true, force: true });
}

function installWindowsFromProgramFiles() {
	const installBin = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'KTX-Software', 'bin');
	if (!existsSync(join(installBin, 'ktx.exe'))) {
		return false;
	}

	copyBinDirectory(installBin);
	return true;
}

async function installWindows() {
	if (installWindowsFromProgramFiles()) {
		console.log('Copied KTX-Software from the existing Program Files installation.');
		return;
	}

	const installerPath = join(pkgRoot, '.ktx-download', WINDOWS_INSTALLER);
	mkdirSync(dirname(installerPath), { recursive: true });

	if (!existsSync(installerPath)) {
		console.log(`Downloading ${WINDOWS_INSTALLER}…`);
		await downloadFile(WINDOWS_INSTALLER_URL, installerPath);
	}

	installWindowsFrom7zip(installerPath);
}

async function installLinux() {
	const archivePath = join(pkgRoot, '.ktx-download', LINUX_ARCHIVE);
	mkdirSync(dirname(archivePath), { recursive: true });

	if (!existsSync(archivePath)) {
		console.log(`Downloading ${LINUX_ARCHIVE}…`);
		await downloadFile(LINUX_ARCHIVE_URL, archivePath);
	}

	mkdirSync(vendorDir, { recursive: true });
	execFileSync(
		'tar',
		[
			'-xjf',
			archivePath,
			'-C',
			vendorDir,
			'--strip-components=2',
			`KTX-Software-${KTX_VERSION}-Linux-x86_64/bin`,
		],
		{ stdio: 'inherit' },
	);
}

if (ktxReady()) {
	console.log(`KTX-Software already present at ${vendorDir}`);
} else if (process.platform === 'win32') {
	await installWindows();
} else if (process.platform === 'linux') {
	await installLinux();
} else {
	throw new Error(
		'Bundled KTX-Software is not available for this platform. Install KTX-Software manually or set GLTF_TRANSFORM_KTX.',
	);
}

if (!ktxReady()) {
	throw new Error(`Failed to install KTX-Software to ${vendorDir}`);
}

console.log(`KTX-Software ready at ${vendorDir}`);
