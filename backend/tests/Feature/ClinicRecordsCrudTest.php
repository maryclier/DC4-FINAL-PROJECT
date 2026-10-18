<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\ConsultationRecord;
use App\Models\Patient;
use App\Models\QueueRecord;
use App\Models\StaffProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClinicRecordsCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_receptionist_can_create_read_update_and_delete_patient_records(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $this->actingAs($receptionist, 'sanctum');

        $created = $this->postJson('/api/patients', [
            'full_name' => 'Alex Rivera',
            'contact_number' => '555-0199',
        ])->assertCreated()
            ->assertJsonPath('patient.full_name', 'Alex Rivera');

        $patientId = $created->json('patient.id');

        $this->getJson("/api/patients/{$patientId}")
            ->assertOk()
            ->assertJsonPath('full_name', 'Alex Rivera');

        $this->patchJson("/api/patients/{$patientId}", [
            'full_name' => 'Alex R.',
        ])->assertOk()
            ->assertJsonPath('patient.full_name', 'Alex R.');

        $this->deleteJson("/api/patients/{$patientId}")
            ->assertOk();

        $this->assertDatabaseMissing('patients', ['id' => $patientId]);
    }

    public function test_administrator_can_manage_staff_accounts_and_profiles(): void
    {
        $administrator = User::factory()->create(['role' => 'administrator']);
        $this->actingAs($administrator, 'sanctum');

        $created = $this->postJson('/api/staff', [
            'name' => 'Morgan Lee',
            'email' => 'morgan.staff@example.test',
            'password' => 'ClinicPass123',
            'password_confirmation' => 'ClinicPass123',
            'role' => 'medical_staff',
            'staff_number' => 'MED-1001',
            'specialization' => 'General practice',
        ])->assertCreated();

        $staffId = $created->json('staff.id');

        $this->getJson("/api/staff/{$staffId}")
            ->assertOk()
            ->assertJsonPath('user.name', 'Morgan Lee');

        $this->patchJson("/api/staff/{$staffId}", [
            'name' => 'Morgan L.',
            'specialization' => 'Family medicine',
        ])->assertOk()
            ->assertJsonPath('staff.user.name', 'Morgan L.')
            ->assertJsonPath('staff.specialization', 'Family medicine');

        $this->deleteJson("/api/staff/{$staffId}")
            ->assertOk();

        $this->assertDatabaseMissing('staff_profiles', ['id' => $staffId]);
        $this->assertDatabaseMissing('users', ['email' => 'morgan.staff@example.test']);
    }

    public function test_receptionist_can_create_read_update_and_delete_pending_appointments(): void
    {
        $receptionist = User::factory()->create(['role' => 'receptionist']);
        $medicalUser = User::factory()->create(['role' => 'medical_staff']);
        $patient = Patient::create([
            'patient_number' => 'PAT-CRUD-100',
            'full_name' => 'Casey Patient',
            'contact_number' => '555-0120',
        ]);
        $medicalStaff = StaffProfile::create([
            'user_id' => $medicalUser->id,
            'staff_number' => 'MED-CRUD-100',
            'specialization' => 'General practice',
            'availability_status' => true,
        ]);
        $this->actingAs($receptionist, 'sanctum');

        $created = $this->postJson('/api/appointments', [
            'patient_id' => $patient->id,
            'staff_profile_id' => $medicalStaff->id,
            'date' => today()->addDay()->toDateString(),
            'time' => '10:30',
            'reason' => 'Routine check',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $appointmentId = $created->json('data.id');

        $this->getJson("/api/appointments/{$appointmentId}")
            ->assertOk()
            ->assertJsonPath('data.reason', 'Routine check');

        $this->patchJson("/api/appointments/{$appointmentId}", [
            'reason' => 'Follow-up visit',
        ])->assertOk()
            ->assertJsonPath('data.reason', 'Follow-up visit');

        $this->deleteJson("/api/appointments/{$appointmentId}")
            ->assertOk();

        $this->assertDatabaseMissing('appointments', ['id' => $appointmentId]);
    }

    public function test_administrator_can_view_edit_and_delete_consultation_records(): void
    {
        $administrator = User::factory()->create(['role' => 'administrator']);
        $medicalUser = User::factory()->create(['role' => 'medical_staff']);
        $patient = Patient::create([
            'patient_number' => 'PAT-CONS-100',
            'full_name' => 'Jamie Patient',
        ]);
        $staff = StaffProfile::create([
            'user_id' => $medicalUser->id,
            'staff_number' => 'MED-CONS-100',
            'availability_status' => true,
        ]);
        $appointment = Appointment::create([
            'patient_id' => $patient->id,
            'staff_profile_id' => $staff->id,
            'date' => today()->toDateString(),
            'time' => '09:00',
            'reason' => 'Consultation',
            'status' => 'approved',
        ]);
        $queue = QueueRecord::create([
            'appointment_id' => $appointment->id,
            'queue_number' => 1,
            'queue_date' => today()->toDateString(),
            'arrival_time' => now(),
            'status' => 'called',
        ]);
        $this->actingAs($administrator, 'sanctum');

        $created = $this->postJson('/api/consultations', [
            'queue_record_id' => $queue->id,
            'staff_profile_id' => $staff->id,
        ])->assertCreated();

        $consultationId = $created->json('consultation.id');

        $this->getJson("/api/consultations/{$consultationId}")
            ->assertOk()
            ->assertJsonPath('status', 'in_progress');

        $this->patchJson("/api/consultations/{$consultationId}", [
            'status' => 'completed',
        ])->assertOk()
            ->assertJsonPath('consultation.status', 'completed');

        $this->assertDatabaseHas('queue_records', [
            'id' => $queue->id,
            'status' => 'completed',
        ]);
        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'completed',
        ]);

        $this->deleteJson("/api/consultations/{$consultationId}")
            ->assertOk();
        $this->assertDatabaseMissing('consultation_records', [
            'id' => $consultationId,
        ]);
    }
}
