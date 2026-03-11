import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create branches table
  await knex.schema.createTable('branches', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('project_id', 255).notNullable();
    table.string('name', 255).notNullable();
    table.uuid('head_snapshot_id').nullable();
    table.string('created_by', 255).notNullable();
    table.bigInteger('created_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.string('color', 20).defaultTo('#2b6cee');
    
    // Unique constraint: branch name must be unique per project
    table.unique(['project_id', 'name']);
    
    // Index for querying branches by project
    table.index('project_id', 'idx_branches_project');
  });

  // Create snapshots table
  await knex.schema.createTable('snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('project_id', 255).notNullable();
    table.uuid('branch_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.text('thumbnail').nullable(); // Base64 encoded
    table.string('created_by', 255).notNullable();
    table.bigInteger('created_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.uuid('parent_snapshot_id').nullable();
    
    // Foreign key to branches
    table.foreign('branch_id').references('id').inTable('branches').onDelete('CASCADE');
    
    // Self-referencing foreign key for parent snapshot
    table.foreign('parent_snapshot_id').references('id').inTable('snapshots').onDelete('SET NULL');
    
    // Indexes
    table.index('project_id', 'idx_snapshots_project');
    table.index('branch_id', 'idx_snapshots_branch');
    table.index('parent_snapshot_id', 'idx_snapshots_parent');
  });

  // Create layer_snapshots table
  await knex.schema.createTable('layer_snapshots', (table) => {
    table.increments('id').primary();
    table.uuid('snapshot_id').notNullable();
    table.string('layer_id', 255).notNullable();
    table.string('name', 255).notNullable();
    table.string('type', 50).defaultTo('Paint');
    table.text('objects').notNullable().defaultTo('[]'); // JSON string of fabric objects
    table.boolean('visible').defaultTo(true);
    table.decimal('opacity', 3, 2).defaultTo(1.00);
    table.string('blend_mode', 50).defaultTo('normal');
    table.integer('z_index').notNullable();
    
    // Foreign key to snapshots
    table.foreign('snapshot_id').references('id').inTable('snapshots').onDelete('CASCADE');
    
    // Index
    table.index('snapshot_id', 'idx_layer_snapshots_snapshot');
  });

  // Add foreign key constraint for head_snapshot_id after snapshots table exists
  await knex.schema.alterTable('branches', (table) => {
    table.foreign('head_snapshot_id').references('id').inTable('snapshots').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove foreign key from branches first
  await knex.schema.alterTable('branches', (table) => {
    table.dropForeign('head_snapshot_id');
  });
  
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('layer_snapshots');
  await knex.schema.dropTableIfExists('snapshots');
  await knex.schema.dropTableIfExists('branches');
}
