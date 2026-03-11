import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Add delta snapshot support columns to layer_snapshots
    await knex.schema.alterTable('layer_snapshots', (table) => {
        // 'full' = contains all serialized object data
        // 'reference' = pointer to another snapshot's layer data
        table.string('snapshot_type', 20).defaultTo('full').notNullable();
        
        // When snapshot_type='reference', this points to the snapshot containing full data
        table.string('reference_snapshot_id', 255).nullable();
        
        // Index for efficient reference resolution
        table.index(['reference_snapshot_id'], 'idx_layer_snapshots_reference');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('layer_snapshots', (table) => {
        table.dropIndex(['reference_snapshot_id'], 'idx_layer_snapshots_reference');
        table.dropColumn('reference_snapshot_id');
        table.dropColumn('snapshot_type');
    });
}
