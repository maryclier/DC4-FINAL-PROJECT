<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ConsultationRecord;
use App\Models\Patient;
use App\Models\QueueRecord;
use App\Models\StaffProfile;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $appointments = Appointment::query();

        if ($user->role === 'patient') {
            $patient = Patient::where('user_id', $user->id)->firstOrFail();
            $appointments->where('patient_id', $patient->id);
        } elseif ($user->role === 'medical_staff') {
            $staff = StaffProfile::where('user_id', $user->id)->firstOrFail();
            $appointments->where('staff_profile_id', $staff->id);
        } elseif (!in_array($user->role, ['administrator', 'receptionist'], true)) {
            abort(403, 'Access denied.');
        }

        $queue = QueueRecord::whereDate('queue_date', today());

        if ($user->role === 'patient') {
            $queue->whereHas('appointment', function ($query) use ($user) {
                $query->where('patient_id', $user->patient->id);
            });
        } elseif ($user->role === 'medical_staff') {
            $queue->whereHas('appointment', function ($query) use ($user) {
                $query->where('staff_profile_id', $user->staffProfile->id);
            });
        }

        $consultations = ConsultationRecord::query();

        if ($user->role === 'medical_staff') {
            $consultations->where(
                'staff_profile_id',
                $user->staffProfile->id
            );
        } elseif ($user->role === 'patient') {
            $consultations->whereHas(
                'queueRecord.appointment',
                function ($query) use ($user) {
                    $query->where('patient_id', $user->patient->id);
                }
            );
        }

        return response()->json([
            'role' => $user->role,
            'total_appointments' => (clone $appointments)->count(),
            'pending_appointments' => (clone $appointments)
                ->where('status', 'pending')->count(),
            'approved_appointments' => (clone $appointments)
                ->where('status', 'approved')->count(),
            'waiting_patients' => (clone $queue)
                ->where('status', 'waiting')->count(),
            'completed_consultations' => (clone $consultations)
                ->where('status', 'completed')->count(),
        ]);
    }
}
