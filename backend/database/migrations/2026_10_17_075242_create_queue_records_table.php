<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('queue_records', function (Blueprint $table) {
            $table->id();

            $table->foreignId('appointment_id')->unique()
                ->constrained('appointments')->cascadeOnDelete();

            $table->unsignedInteger('queue_number');
            $table->date('queue_date');
            $table->dateTime('arrival_time')->nullable();

            $table->enum('status', [
                'waiting',
                'called',
                'in_consultation',
                'completed',
                'cancelled',
            ])->default('waiting');

            $table->timestamps();

            $table->unique(['queue_date', 'queue_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_records');
    }
};
