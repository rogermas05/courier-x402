import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CallBrief, CallOutcome } from '@dispatch/caller';

/**
 * Paid jobs, one JSON file each.
 *
 * A job is only ever created after its payment settled, so every record here
 * is money Dispatch holds. Writes are atomic (temp file, then rename) because a
 * half-written record is a payment nobody can account for.
 */

export type JobStatus = 'calling' | 'completed' | 'failed' | 'interrupted';

export interface Job {
	/** 128 random bits. Knowing it is what entitles a caller to read the transcript. */
	id: string;
	status: JobStatus;
	createdAt: string;
	updatedAt: string;
	brief: CallBrief;
	maxMinutes: number;
	payment: { payer: string; amount: string; transaction: string };
	outcome?: CallOutcome;
	error?: string;
	refund?: { amount: string; transaction?: string; error?: string };
}

export class JobStore {
	constructor(private readonly dir: string) {
		mkdirSync(dir, { recursive: true });
	}

	private path(id: string): string {
		if (!/^[0-9a-f]{32}$/.test(id)) throw new Error(`invalid job id ${id}`);
		return join(this.dir, `${id}.json`);
	}

	private write(job: Job): Job {
		const target = this.path(job.id);
		writeFileSync(`${target}.tmp`, JSON.stringify(job, null, 2));
		renameSync(`${target}.tmp`, target);
		return job;
	}

	create(job: Omit<Job, 'createdAt' | 'updatedAt'>): Job {
		const now = new Date().toISOString();
		return this.write({ ...job, createdAt: now, updatedAt: now });
	}

	get(id: string): Job | null {
		if (!/^[0-9a-f]{32}$/.test(id)) return null;
		try {
			return JSON.parse(readFileSync(this.path(id), 'utf8')) as Job;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw err;
		}
	}

	update(id: string, patch: Partial<Omit<Job, 'id' | 'createdAt'>>): Job {
		const current = this.get(id);
		if (!current) throw new Error(`job ${id} not found`);
		return this.write({ ...current, ...patch, updatedAt: new Date().toISOString() });
	}

	all(): Job[] {
		return readdirSync(this.dir)
			.filter((f) => /^[0-9a-f]{32}\.json$/.test(f))
			.map((f) => JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as Job);
	}
}
