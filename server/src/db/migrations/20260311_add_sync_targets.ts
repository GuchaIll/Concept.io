import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Sync targets table — configures where snapshots get exported
  await knex.schema.createTable('sync_targets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('project_id', 255).notNullable();
    table.string('type', 20).notNullable(); // 'git' | 'local'
    table.string('name', 255).notNullable();
    table.jsonb('config').notNullable().defaultTo('{}');
    // Git config: { repoUrl, branch, path, provider, encryptedToken }
    // Local config: { folderPath }
    table.boolean('enabled').defaultTo(true);
    table.bigInteger('last_synced_at').nullable();
    table.string('last_sync_snapshot_id', 255).nullable();
    table.string('last_sync_status', 20).nullable(); // 'success' | 'failed' | 'syncing'
    table.text('last_sync_error').nullable();
    table.string('created_by', 255).notNullable();
    table.bigInteger('created_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.bigInteger('updated_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));

    table.index('project_id', 'idx_sync_targets_project');
  });

  // Sync log table — records each sync attempt
  await knex.schema.createTable('sync_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('sync_target_id').notNullable().references('id').inTable('sync_targets').onDelete('CASCADE');
    table.string('snapshot_id', 255).notNullable();
    table.string('status', 20).notNullable(); // 'success' | 'failed' | 'skipped'
    table.text('message').nullable();
    table.jsonb('details').nullable(); // { filesWritten, commitSha, etc }
    table.bigInteger('started_at').notNullable();
    table.bigInteger('completed_at').nullable();
    table.integer('duration_ms').nullable();

    table.index('sync_target_id', 'idx_sync_log_target');
    table.index('snapshot_id', 'idx_sync_log_snapshot');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_log');
  await knex.schema.dropTableIfExists('sync_targets');
}
