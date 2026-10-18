<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@clinicqueue.test'],
            [
                'name' => 'ClinicQueue Administrator',
                'password' => Hash::make('Admin@123'),
                'role' => 'administrator',
            ]
        );
    }
}