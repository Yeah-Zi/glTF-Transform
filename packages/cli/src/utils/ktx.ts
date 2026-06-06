import { execSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn, TrustedCommand, commandExists, waitExit } from './process.js';

const KTX_BIN_NAMES = process.platform === 'win32' ? ['ktx.exe', 'ktx'] : ['ktx'];

async function pathExists(path: string): Promise<boolean> {
	return access(path, constants.F_OK)
		.then(() => true)
		.catch(() => false);
}

function getAppRoot(): string {
	const entry = process.argv[1];
	if (entry) {
		return resolve(dirname(entry), '..');
	}

	return resolve(import.meta.dirname, '../..');
}

function getBundledKtxCandidates(appRoot: string): string[] {
	return KTX_BIN_NAMES.map((name) => join(appRoot, 'vendor', 'ktx', name));
}

function getDefaultInstallCandidates(): string[] {
	if (process.platform === 'win32') {
		return [join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'KTX-Software', 'bin', 'ktx.exe')];
	}

	if (process.platform === 'darwin') {
		return ['/usr/local/bin/ktx', '/opt/homebrew/bin/ktx'];
	}

	return ['/usr/bin/ktx', '/usr/local/bin/ktx'];
}

async function resolvePathOnPath(command: TrustedCommand): Promise<string | null> {
	if (!(await commandExists(command))) {
		return null;
	}

	if (process.platform === 'win32') {
		try {
			return execSync(`where ${command}`, { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
		} catch {
			return command;
		}
	}

	return command;
}

/** Resolves the KTX-Software CLI executable, if available. */
export async function resolveKtxCommand(): Promise<string | null> {
	const envPath = process.env.GLTF_TRANSFORM_KTX ?? process.env.KTX_BIN;
	if (envPath && (await pathExists(envPath))) {
		return envPath;
	}

	const appRoot = getAppRoot();
	for (const candidate of getBundledKtxCandidates(appRoot)) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	for (const candidate of getDefaultInstallCandidates()) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return resolvePathOnPath(TrustedCommand.KTX);
}

export async function spawnKtx(args: string[]): Promise<ChildProcess> {
	const ktx = await resolveKtxCommand();
	if (!ktx) {
		throw new Error('Command "ktx" not found.');
	}

	const ktxDir = dirname(ktx);
	return spawn(ktx, args, {
		env: {
			...process.env,
			PATH: `${ktxDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
		},
	});
}

export { waitExit };
