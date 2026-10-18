<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\StaffProfile;
use App\Models\User;
use Database\Seeders\DemoAccountsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DemoAccountsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_the_demo_accounts_and_role_profiles(): void
    {
        $this->seed(DemoAccountsSeeder::class);

        $expectedAccounts = [
            'admin@clinicqueue.test' => ['administrator', 'Admin@123'],
            'patient@clinicqueue.test' => ['patient', 'Patient@123'],
            'receptionist@clinicqueue.test' => ['receptionist', 'Reception@123'],
            'medical@clinicqueue.test' => ['medical_staff', 'Medical@123'],
        ];

        foreach ($expectedAccounts as $email => [$role, $password]) {
            $user = User::where('email', $email)->firstOrFail();

            $this->assertSame($role, $user->role);
            $this->assertTrue(Hash::check($password, $user->password));
        }

        $patient = User::where('email', 'patient@clinicqueue.test')->firstOrFail();
        $this->assertTrue(Patient::where('user_id', $patient->id)->exists());

        $receptionist = User::where('email', 'receptionist@clinicqueue.test')->firstOrFail();
        $medicalStaff = User::where('email', 'medical@clinicqueue.test')->firstOrFail();
        $this->assertTrue(StaffProfile::where('user_id', $receptionist->id)->exists());
        $this->assertTrue(StaffProfile::where('user_id', $medicalStaff->id)->exists());
    }

    public function test_it_is_repeatable_and_preserves_unrelated_users_and_profiles(): void
    {
        $unrelatedUser = User::factory()->create([
            'email' => 'existing@clinicqueue.test',
            'role' => 'patient',
        ]);

        $this->seed(DemoAccountsSeeder::class);
        $this->seed(DemoAccountsSeeder::class);

        $this->assertSame(5, User::count());
        $this->assertSame('existing@clinicqueue.test', $unrelatedUser->fresh()->email);
        $this->assertSame(
            1,
            User::where('email', 'patient@clinicqueue.test')
                ->firstOrFail()
                ->patient()
                ->count()
        );
        $this->assertSame(
            1,
            User::where('email', 'medical@clinicqueue.test')
                ->firstOrFail()
                ->staffProfile()
                ->count()
        );
    }
}
