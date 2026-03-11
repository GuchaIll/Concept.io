import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add locked column to layer_snapshots
  await knex.schema.alterTable('layer_snapshots', (table) => {
    table.boolean('locked').defaultTo(false);
  });

  // Create projects table for multi-session support
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.text('thumbnail_url').nullable();
    table.string('created_by', 255).notNullable();
    table.bigInteger('created_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.bigInteger('updated_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.integer('canvas_width').defaultTo(1920);
    table.integer('canvas_height').defaultTo(1080);
    table.jsonb('settings').defaultTo('{}');

    table.index('created_by', 'idx_projects_created_by');
    table.index('updated_at', 'idx_projects_updated_at');
  });

  // Create assets table for asset vault persistence
  await knex.schema.createTable('assets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('project_id', 255).notNullable();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.text('image_data').notNullable();
    table.text('thumbnail_data').nullable();
    table.specificType('tags', 'text[]').defaultTo('{}');
    table.string('category', 100).nullable();
    table.integer('width').notNullable();
    table.integer('height').notNullable();
    table.string('created_by', 255).notNullable();
    table.bigInteger('created_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.bigInteger('updated_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.string('source_layer_id', 255).nullable();
    table.string('source_snapshot_id', 255).nullable();
    table.integer('usage_count').defaultTo(0);
    table.bigInteger('last_used_at').nullable();
    table.boolean('is_shared').defaultTo(false);
    table.specificType('shared_with', 'text[]').defaultTo('{}');

    table.index('project_id', 'idx_assets_project');
    table.index('created_at', 'idx_assets_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('assets');
  await knex.schema.dropTableIfExists('projects');
  await knex.schema.alterTable('layer_snapshots', (table) => {
    table.dropColumn('locked');
  });
}
