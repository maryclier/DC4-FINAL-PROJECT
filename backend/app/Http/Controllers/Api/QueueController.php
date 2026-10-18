<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\QueueRecord;
use App\Models\StaffProfile;
use App\Models\ConsultationRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QueueController extends Controller
{
    public function index(Request $request)
    {
        abort_unless(
            in_array($request->user()->role, [
                'administrator', 'receptionist', 'medical_staff'
            ], true),
            403,
            'Access denied.'
        );

        $query = QueueRecord::with([
            'appointment.patient',
            'appointment.staffProfile.user',
            'consultationRecord',
        ])->whereDate('queue_date', today());

        if ($request->filled('status')) {
            $request->validate([
                'status' => Rule::in([
                    'waiting', 'called', 'in_consultation',
                    'completed', 'cancelled',
                ]),
            ]);

            $query->where('status', $request->status);
        }

        if ($request->user()->role === 'medical_staff') {
            $staff = StaffProfile::where(
                'user_id', $request->user()->id
            )->firstOrFail();

            $query->whereHas('appointment', function ($q) use ($staff) {
                $q->where('staff_profile_id', $staff->id);
            });
        }

        return $query->orderBy('queue_number')->paginate(10);
    }

    public function arrive(Request $request, Appointment $appointment)
    {
        abort_unless(
            in_array($request->user()->role, [
                'administrator', 'receptionist'
            ], true),
            403,
            'Only authorized clinic staff can register arrivals.'
        );

        $queue = DB::transaction(function () use ($appointment) {
            // Lock the appointment row to prevent duplicate arrivals.
            $lockedAppointment = Appointment::whereKey($appointment->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $lockedAppointment->status === 'approved',
                422,
                'Only approved appointments can join the queue.'
            );

            abort_unless(
                $lockedAppointment->date->isToday(),
                422,
                'Only appointments scheduled for today can join the queue.'
            );

            $existing = QueueRecord::where(
                'appointment_id', $lockedAppointment->id
            )->first();

            if ($existing) {
                return $existing;
            }

            $date = today()->toDateString();

            // Lock today's queue rows before allocating the next number.
            QueueRecord::whereDate('queue_date', $date)
                ->lockForUpdate()
                ->get(['id']);

            $lastNumber = QueueRecord::whereDate('queue_date', $date)
                ->max('queue_number') ?? 0;

            return QueueRecord::create([
                'appointment_id' => $lockedAppointment->id,
                'queue_number' => $lastNumber + 1,
                'queue_date' => $date,
                'arrival_time' => now(),
                'status' => 'waiting',
            ]);
        });

        return response()->json([
            'message' => 'Patient arrival recorded.',
            'queue' => $queue->load('appointment.patient'),
        ], 201);
    }

    public function updateStatus(Request $request, QueueRecord $queueRecord)
    {
        $user = $request->user();

        abort_unless(
            in_array($user->role, [
                'administrator', 'receptionist', 'medical_staff'
            ], true),
            403,
            'Access denied.'
        );

        $data = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'waiting', 'called', 'in_consultation',
                    'completed', 'cancelled',
                ]),
            ],
        ]);

        if ($user->role === 'medical_staff') {
            $staff = StaffProfile::where(
                'user_id', $user->id
            )->firstOrFail();

            abort_unless(
                $queueRecord->appointment->staff_profile_id === $staff->id,
                403,
                'You can only manage your assigned patients.'
            );
        }

        $next = $data['status'];

        DB::transaction(function () use ($queueRecord, $next, $user) {
            $queueRecord = QueueRecord::whereKey($queueRecord->id)
                ->lockForUpdate()
                ->firstOrFail();

            $allowedTransitions = [
                'waiting' => ['called', 'cancelled'],
                'called' => ['waiting', 'in_consultation', 'cancelled'],
                'in_consultation' => ['completed'],
                'completed' => [],
                'cancelled' => [],
            ];

            abort_unless(
                $queueRecord->status === $next ||
                    in_array(
                        $next,
                        $allowedTransitions[$queueRecord->status] ?? [],
                        true
                    ),
                422,
                'That queue status transition is not allowed.'
            );

            if ($next === 'in_consultation') {
                $staff = $user->staffProfile;

                if (!$staff) {
                    abort(422, 'A staff profile is required.');
                }

                ConsultationRecord::firstOrCreate(
                    ['queue_record_id' => $queueRecord->id],
                    [
                        'staff_profile_id' => $staff->id,
                        'start_time' => now(),
                        'status' => 'in_progress',
                    ]
                );
            }

            if ($next === 'completed') {
                $consultation = ConsultationRecord::where(
                    'queue_record_id', $queueRecord->id
                )->first();

                if ($consultation) {
                    $consultation->update([
                        'end_time' => now(),
                        'status' => 'completed',
                    ]);
                }

                $queueRecord->appointment->update([
                    'status' => 'completed',
                ]);
            }

            if ($next === 'cancelled') {
                $queueRecord->appointment->update([
                    'status' => 'cancelled',
                ]);
            }

            $queueRecord->update(['status' => $next]);
        });

        return response()->json([
            'message' => 'Queue status updated.',
            'queue' => $queueRecord->fresh()->load(
                'appointment.patient',
                'consultationRecord'
            ),
        ]);
    }
}
