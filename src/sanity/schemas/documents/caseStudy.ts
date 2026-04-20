import { defineArrayMember, defineField, defineType } from 'sanity';

export default defineType({
  name: 'caseStudy',
  title: 'Case Study',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'logoId',
      title: 'Logo ID',
      description: 'Stable machine ID used by inline paragraph annotations and case study URLs.',
      type: 'string',
      validation: (Rule) =>
        Rule.required()
          .regex(/^[a-z0-9-]+$/, {
            name: 'token',
            invert: false
          })
          .error('Use lowercase letters, numbers, and dashes only.')
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'logoId',
        maxLength: 96,
        isUnique: (value, context) => context.defaultIsUnique(value, context)
      },
      validation: (Rule) => Rule.required()
    }),
    defineField({
      name: 'orderRank',
      title: 'Order Rank',
      type: 'number',
      initialValue: 100
    }),
    defineField({
      name: 'role',
      title: 'Role Tags',
      type: 'array',
      of: [defineArrayMember({ type: 'string' })]
    }),
    defineField({
      name: 'slides',
      title: 'Slides',
      type: 'array',
      of: [defineArrayMember({ type: 'caseStudySlide' })],
      validation: (Rule) => Rule.required().min(1)
    })
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'logoId'
    }
  }
});
