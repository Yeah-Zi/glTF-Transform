import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const repoRoot = resolve(pkgRoot, '../..');
const nodeModules = join(repoRoot, 'node_modules');
const stagingDir = join(pkgRoot, '.caxa-staging');
const releaseDir = join(pkgRoot, 'dist', 'release');
const exePath = join(releaseDir, 'gltf-transform.exe');
const caxaBin = join(nodeModules, '@appthreat/caxa/build/index.mjs');

const workspacePackages = ['core', 'extensions', 'functions'];

function resolveNodeExe() {
	if (process.env.NODE_EXE) return process.env.NODE_EXE;

	const candidates = new Set([process.execPath]);
	try {
		for (const line of execFileSync('where node', { encoding: 'utf8', shell: true }).trim().split(/\r?\n/)) {
			candidates.add(line.trim());
		}
	} catch {
		// ignore
	}

	for (const candidate of candidates) {
		if (!candidate) continue;
		try {
			const version = execFileSync(candidate, ['--version'], { encoding: 'utf8' }).trim();
			const major = Number.parseInt(version.replace(/^v/, ''), 10);
			if (major >= 22) return candidate;
		} catch {
			// try next candidate
		}
	}

	throw new Error('Node.js v22+ is required to run caxa. Set NODE_EXE to a Node 22+ binary.');
}

function ensureBuilt() {
	const cliDist = join(pkgRoot, 'dist/cli.mjs');
	if (existsSync(cliDist)) return;

	console.log('Building packages…');
	execFileSync('corepack', ['yarn', 'build'], { cwd: repoRoot, stdio: 'inherit', shell: true });
}

function copyWorkspacePackage(name) {
	const src = join(repoRoot, 'packages', name);
	const dest = join(stagingDir, 'packages', name);
	mkdirSync(dest, { recursive: true });
	cpSync(join(src, 'package.json'), join(dest, 'package.json'));
	cpSync(join(src, 'dist'), join(dest, 'dist'), { recursive: true });
}

function createStagingPackageJson() {
	const cliPkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
	const dependencies = { ...cliPkg.dependencies };

	for (const name of workspacePackages) {
		dependencies[`@gltf-transform/${name}`] = `file:./packages/${name}`;
	}

	writeFileSync(
		join(stagingDir, 'package.json'),
		`${JSON.stringify(
			{
				name: 'gltf-transform-cli',
				private: true,
				type: 'module',
				version: cliPkg.version,
				dependencies,
			},
			null,
			2,
		)}\n`,
	);
}

ensureBuilt();

console.log('Ensuring KTX-Software is available…');
execFileSync(process.execPath, [join(pkgRoot, 'scripts/download-ktx.mjs')], { stdio: 'inherit' });

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
for (const entry of ['gltf-transform.exe', 'binary-metadata.json', 'README.txt', 'node_modules', 'cli.bundle.cjs']) {
	rmSync(join(releaseDir, entry), { recursive: true, force: true });
}
mkdirSync(releaseDir, { recursive: true });

cpSync(join(pkgRoot, 'bin'), join(stagingDir, 'bin'), { recursive: true });
cpSync(join(pkgRoot, 'dist'), join(stagingDir, 'dist'), { recursive: true });
cpSync(join(pkgRoot, 'vendor', 'ktx'), join(stagingDir, 'vendor', 'ktx'), { recursive: true });

for (const name of workspacePackages) {
	copyWorkspacePackage(name);
}

createStagingPackageJson();

console.log('Installing production dependencies for staging…');
execFileSync('npm', ['install', '--omit=dev', '--install-links=false', '--no-audit', '--no-fund'], {
	cwd: stagingDir,
	stdio: 'inherit',
	shell: true,
});

for (const name of workspacePackages) {
	const dest = join(stagingDir, 'node_modules/@gltf-transform', name);
	const src = join(stagingDir, 'packages', name);
	rmSync(dest, { recursive: true, force: true });
	cpSync(src, dest, { recursive: true });
}

rmSync(join(stagingDir, 'packages'), { recursive: true, force: true });

console.log('Packaging with caxa…');
const nodeExe = resolveNodeExe();
const nodeCommand =
	process.platform === 'win32' ? '{{caxa}}/node_modules/.bin/node.exe' : '{{caxa}}/node_modules/.bin/node';
execFileSync(
	nodeExe,
	[
		caxaBin,
		'--input',
		stagingDir,
		'--output',
		exePath,
		'--exclude',
		'**/*.map',
		'**/*.md',
		'**/LICENSE*',
		'packages/**',
		'--',
		nodeCommand,
		'{{caxa}}/bin/cli.js',
	],
	{ stdio: 'inherit' },
);

writeFileSync(
	join(releaseDir, 'README.txt'),
	[
		'gltf-transform Windows build (caxa)',
		'',
		'Single executable. First launch extracts to a temp directory and may take a few seconds.',
		'Set CAXA_TEMP_DIR to override the extraction location.',
		'',
		'Example:',
		'  .\\gltf-transform.exe --help',
		'  .\\gltf-transform.exe optimize input.glb output.glb',
		'',
		'KTX compression (etc1s, uastc, ktxdecompress) is bundled in this build.',
		'Override with GLTF_TRANSFORM_KTX if needed.',
	].join('\n'),
);

console.log(`\nBuilt ${exePath}`);
