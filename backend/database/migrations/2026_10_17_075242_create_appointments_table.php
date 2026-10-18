<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appointments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('patient_id')
                ->constrained('patients')->cascadeOnDelete();

            $table->foreignId('staff_profile_id')->nullable()
                ->constrained('staff_profiles')->nullOnDelete();

            $table->date('date');
            $table->time('time');
            $table->text('reason');

            $table->enum('status', [
                'pending',
                'approved',
                'rescheduled',
                'cancelled',
                'completed',
            ])->default('pending');

            $table->timestamps();

            $table->index(['date', 'time', 'staff_profile_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appointments');
    }
};
