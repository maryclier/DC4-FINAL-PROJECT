<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ConsultationRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'queue_record_id',
        'staff_profile_id',
        'start_time',
        'end_time',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'start_time' => 'datetime',
            'end_time' => 'datetime',
        ];
    }

    public function queueRecord()
    {
        return $this->belongsTo(QueueRecord::class);
    }

    public function staffProfile()
    {
        return $this->belongsTo(StaffProfile::class);
    }
}
