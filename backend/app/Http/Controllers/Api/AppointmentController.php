<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Patient;
use App\Models\StaffProfile;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AppointmentController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Appointment::with([
            'patient',
            'staffProfile.user',
            'queueRecord',
        ]);

        if ($user->role === 'patient') {
            $patient = Patient::where('user_id', $user->id)->firstOrFail();
            $query->where('patient_id', $patient->id);
        } elseif ($user->role === 'medical_staff') {
            $staff = StaffProfile::where('user_id', $user->id)->firstOrFail();
            $query->where('staff_profile_id', $staff->id);
        } else {
            $this->authorizeClinicStaff($request);
        }

        $appointments = $query
            ->orderByDesc('date')
            ->orderByDesc('time')
            ->get();

        return response()->json([
            'data' => $appointments,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        abort_unless(
            in_array($user->role, [
                'patient', 'administrator', 'receptionist',
            ], true),
            403,
            'You are not allowed to book appointments.'
        );

        // Support both React and database field names.
        $aliases = [];

        if (!$request->exists('date') && $request->exists('appointment_date')) {
            $aliases['date'] = $request->input('appointment_date');
        }

        if (!$request->exists('time') && $request->exists('appointment_time')) {
            $aliases['time'] = $request->input('appointment_time');
        }

        $request->merge($aliases);

        $validated = $request->validate([
            'patient_id' => [
                $user->role === 'patient' ? 'sometimes' : 'required',
                'integer',
                'exists:patients,id',
            ],
            'staff_profile_id' => [
                'nullable',
                'integer',
                'exists:staff_profiles,id',
            ],
            'reason' => [
                'required',
                'string',
                'max:1000',
            ],
            'date' => [
                'required',
                'date',
                'after_or_equal:today',
            ],
            'time' => [
                'required',
                'date_format:H:i',
            ],
        ]);

        if ($user->role === 'patient') {
            $patient = Patient::where('user_id', $user->id)->firstOrFail();
            $validated['patient_id'] = $patient->id;
            unset($validated['staff_profile_id']);
        }

        $this->ensureMedicalStaff($validated['staff_profile_id'] ?? null);

        $validated['status'] = 'pending';

        $appointment = Appointment::create($validated);

        return response()->json([
            'message' => 'Appointment booked successfully!',
            'data' => $appointment->load([
                'patient',
                'staffProfile.user',
                'queueRecord',
            ]),
        ], 201);
    }

    public function show(Request $request, Appointment $appointment)
    {
        $this->authorizeAppointment($request, $appointment);

        return response()->json([
            'data' => $appointment->load([
                'patient',
                'staffProfile.user',
                'queueRecord',
            ]),
        ]);
    }

    public function update(
        Request $request,
        Appointment $appointment
    ) {
        $user = $request->user();
        $this->authorizeAppointment($request, $appointment);

        $aliases = [];

        if (!$request->exists('date') && $request->exists('appointment_date')) {
            $aliases['date'] = $request->input('appointment_date');
        }

        if (!$request->exists('time') && $request->exists('appointment_time')) {
            $aliases['time'] = $request->input('appointment_time');
        }

        $request->merge($aliases);

        if ($user->role === 'patient') {
            $validated = $request->validate([
                'reason' => ['sometimes', 'required', 'string', 'max:1000'],
                'date' => [
                    'sometimes',
                    'required',
                    'date',
                    'after_or_equal:today',
                ],
                'time' => ['sometimes', 'required', 'date_format:H:i'],
                'status' => [
                    'sometimes',
                    'required',
                    'in:cancelled',
                ],
            ]);

            abort_unless(
                $appointment->status === 'pending',
                422,
                'Only pending appointments can be changed by patients.'
            );

            abort_unless(
                $validated !== [],
                422,
                'Provide at least one appointment field to update.'
            );
        } else {
            $this->authorizeClinicStaff($request);
            $validated = $request->validate([
                'patient_id' => [
                    'sometimes',
                    'required',
                    'integer',
                    'exists:patients,id',
                ],
                'staff_profile_id' => [
                    'sometimes',
                    'nullable',
                    'integer',
                    'exists:staff_profiles,id',
                ],
                'reason' => [
                    'sometimes',
                    'required',
                    'string',
                    'max:1000',
                ],
                'date' => [
                    'sometimes',
                    'required',
                    'date',
                    'after_or_equal:today',
                ],
                'time' => [
                    'sometimes',
                    'required',
                    'date_format:H:i',
                ],
                'status' => [
                    'sometimes',
                    'required',
                    'in:pending,approved,rescheduled,cancelled',
                ],
            ]);

            if (isset($validated['status'])) {
                $allowedTransitions = [
                    'pending' => ['approved', 'rescheduled', 'cancelled'],
                    'approved' => ['rescheduled', 'cancelled'],
                    'rescheduled' => ['approved', 'cancelled'],
                    'cancelled' => [],
                    'completed' => [],
                ];

                abort_unless(
                    in_array(
                        $validated['status'],
                        $allowedTransitions[$appointment->status] ?? [],
                        true
                    ),
                    422,
                    'That appointment status transition is not allowed.'
                );
            }
        }

        if (array_key_exists('staff_profile_id', $validated)) {
            $this->ensureMedicalStaff($validated['staff_profile_id']);
        }

        $appointment->update($validated);

        return response()->json([
            'message' => 'Appointment updated successfully!',
            'data' => $appointment->fresh()->load([
                'patient',
                'staffProfile.user',
                'queueRecord',
            ]),
        ]);
    }

    public function destroy(Request $request, Appointment $appointment)
    {
        $this->authorizeClinicStaff($request);

        abort_unless(
            $appointment->status === 'pending' &&
                !$appointment->queueRecord()->exists(),
            422,
            'Only pending appointments without queue records can be deleted.'
        );

        $appointment->delete();

        return response()->json([
            'message' => 'Appointment deleted successfully!',
        ]);
    }

    private function authorizeClinicStaff(Request $request): void
    {
        abort_unless(
            in_array($request->user()->role, [
                'administrator', 'receptionist',
            ], true),
            403,
            'Only authorized clinic staff can manage all appointments.'
        );
    }

    private function ensureMedicalStaff(?int $staffProfileId): void
    {
        if ($staffProfileId === null) {
            return;
        }

        $profile = StaffProfile::with('user')->findOrFail($staffProfileId);

        if ($profile->user?->role !== 'medical_staff') {
            throw ValidationException::withMessages([
                'staff_profile_id' => 'Appointments can only be assigned to medical staff.',
            ]);
        }
    }

    private function authorizeAppointment(
        Request $request,
        Appointment $appointment
    ): void {
        $user = $request->user();

        if ($user->role === 'patient') {
            abort_unless(
                $appointment->patient()->where('user_id', $user->id)->exists(),
                403,
                'You may only access your own appointments.'
            );

            return;
        }

        if ($user->role === 'medical_staff') {
            abort_unless(
                $appointment->staffProfile()
                    ->where('user_id', $user->id)
                    ->exists(),
                403,
                'You may only access appointments assigned to you.'
            );

            return;
        }

        $this->authorizeClinicStaff($request);
    }
}
