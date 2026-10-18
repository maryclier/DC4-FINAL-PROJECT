<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultation_records', function (Blueprint $table) {
            $table->id();

            $table->foreignId('queue_record_id')->unique()
                ->constrained('queue_records')->cascadeOnDelete();

            $table->foreignId('staff_profile_id')
                ->constrained('staff_profiles')->restrictOnDelete();

            $table->dateTime('start_time')->nullable();
            $table->dateTime('end_time')->nullable();

            $table->enum('status', [
                'not_started',
                'in_progress',
                'completed',
            ])->default('not_started');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consultation_records');
    }
};
