<?php

namespace Database\Seeders;

use App\Models\Patient;
use App\Models\StaffProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DemoAccountsSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $this->upsertUser(
                'admin@clinicqueue.test',
                'ClinicQueue Administrator',
                'Admin@123',
                'administrator'
            );

            $patient = $this->upsertUser(
                'patient@clinicqueue.test',
                'Demo Patient',
                'Patient@123',
                'patient'
            );

            Patient::firstOrCreate(
                ['user_id' => $patient->id],
                [
                    'patient_number' => 'PAT-' .
                        str_pad((string) $patient->id, 6, '0', STR_PAD_LEFT),
                    'full_name' => $patient->name,
                ]
            );

            $receptionist = $this->upsertUser(
                'receptionist@clinicqueue.test',
                'Demo Receptionist',
                'Reception@123',
                'receptionist'
            );

            StaffProfile::firstOrCreate(
                ['user_id' => $receptionist->id],
                [
                    'staff_number' => 'STF-' .
                        str_pad((string) $receptionist->id, 6, '0', STR_PAD_LEFT),
                    'specialization' => 'Reception',
                    'availability_status' => true,
                ]
            );

            $medicalStaff = $this->upsertUser(
                'medical@clinicqueue.test',
                'Demo Medical Staff',
                'Medical@123',
                'medical_staff'
            );

            StaffProfile::firstOrCreate(
                ['user_id' => $medicalStaff->id],
                [
                    'staff_number' => 'STF-' .
                        str_pad((string) $medicalStaff->id, 6, '0', STR_PAD_LEFT),
                    'specialization' => 'General Practice',
                    'availability_status' => true,
                ]
            );
        });
    }

    private function upsertUser(
        string $email,
        string $name,
        string $password,
        string $role
    ): User {
        return User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'role' => $role,
            ]
        );
    }
}
