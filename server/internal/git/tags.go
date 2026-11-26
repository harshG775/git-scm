package git

import (
	"context"
	"strconv"
	"strings"
)

type Tag struct {
	Name    string `json:"name"`
	Oid     string `json:"oid"`
	Time    int64  `json:"time"`
	Subject string `json:"subject"`
}

type TagList struct {
	IsRepo bool  `json:"isRepo"`
	Tags   []Tag `json:"tags"`
}

// Tags lists all tags newest first by their creator date.
func (r Repo) Tags(ctx context.Context) (TagList, error) {
	list := TagList{Tags: []Tag{}}
	status, err := r.Status(ctx)
	if err != nil {
		return list, err
	}
	if !status.IsRepo {
		return list, nil
	}
	list.IsRepo = true

	const sep = "%00"
	format := strings.Join([]string{
		"%(refname:strip=2)",
		"%(objectname:short)",
		"%(creatordate:unix)",
		"%(contents:subject)",
	}, sep)
	res, err := r.run(ctx, opts{}, "for-each-ref", "--sort=-creatordate", "--format="+format, "refs/tags")
	if err != nil {
		return list, err
	}
	for _, line := range strings.Split(strings.TrimSpace(string(res.out)), "\n") {
		fields := strings.Split(strings.TrimRight(line, "\r"), "\x00")
		if len(fields) != 4 {
			continue
		}
		time, _ := strconv.ParseInt(fields[2], 10, 64)
		list.Tags = append(list.Tags, Tag{Name: fields[0], Oid: fields[1], Time: time, Subject: fields[3]})
	}
	return list, nil
}
